#include <atomic>
#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include <winsock2.h>
#include <ws2tcpip.h>
#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include <napi.h>

#pragma comment(lib, "Ws2_32.lib")

namespace {
HMODULE g_lib = nullptr;

using zts_node_start_fn = int (*)();
using zts_node_stop_fn = int (*)();
using zts_net_join_fn = int (*)(uint64_t);
using zts_net_transport_is_ready_fn = int (*)(uint64_t);
using zts_node_get_id_fn = uint64_t (*)();

using zts_socket_fn = int (*)(int, int, int);
using zts_bind_fn = int (*)(int, const sockaddr*, int);
using zts_listen_fn = int (*)(int, int);
using zts_accept_fn = int (*)(int, sockaddr*, int*);
using zts_connect_fn = int (*)(int, const sockaddr*, int);
using zts_recv_fn = int (*)(int, void*, int, int);
using zts_send_fn = int (*)(int, const void*, int, int);
using zts_close_fn = int (*)(int);

zts_node_start_fn g_zts_node_start = nullptr;
zts_node_stop_fn g_zts_node_stop = nullptr;
zts_net_join_fn g_zts_net_join = nullptr;
zts_net_transport_is_ready_fn g_zts_net_transport_is_ready = nullptr;
zts_node_get_id_fn g_zts_node_get_id = nullptr;

zts_socket_fn g_zts_socket = nullptr;
zts_bind_fn g_zts_bind = nullptr;
zts_listen_fn g_zts_listen = nullptr;
zts_accept_fn g_zts_accept = nullptr;
zts_connect_fn g_zts_connect = nullptr;
zts_recv_fn g_zts_recv = nullptr;
zts_send_fn g_zts_send = nullptr;
zts_close_fn g_zts_close = nullptr;

std::atomic<bool> g_proxy_running{false};
std::atomic<int> g_proxy_active_connections{0};
std::thread g_accept_thread;
std::mutex g_proxy_mutex;
int g_proxy_listener = -1;
int g_proxy_max_connections = 128;
int g_proxy_idle_timeout_ms = 120000;
bool g_proxy_log = false;
std::vector<std::string> g_proxy_allow_ips;

void reset_symbols() {
  g_zts_node_start = nullptr;
  g_zts_node_stop = nullptr;
  g_zts_net_join = nullptr;
  g_zts_net_transport_is_ready = nullptr;
  g_zts_node_get_id = nullptr;

  g_zts_socket = nullptr;
  g_zts_bind = nullptr;
  g_zts_listen = nullptr;
  g_zts_accept = nullptr;
  g_zts_connect = nullptr;
  g_zts_recv = nullptr;
  g_zts_send = nullptr;
  g_zts_close = nullptr;
}

bool ensure_winsock() {
  static bool inited = false;
  static bool ok = false;
  if (inited) {
    return ok;
  }
  inited = true;
  WSADATA wsa_data{};
  ok = WSAStartup(MAKEWORD(2, 2), &wsa_data) == 0;
  return ok;
}

uint64_t parse_network_id(const Napi::Value& value, Napi::Env env) {
  if (value.IsBigInt()) {
    bool lossless = false;
    uint64_t v = value.As<Napi::BigInt>().Uint64Value(&lossless);
    if (!lossless) {
      Napi::TypeError::New(env, "networkId bigint is out of uint64 range")
        .ThrowAsJavaScriptException();
      return 0;
    }
    return v;
  }

  if (value.IsString()) {
    std::string s = value.As<Napi::String>().Utf8Value();
    if (s.empty()) {
      Napi::TypeError::New(env, "networkId cannot be empty").ThrowAsJavaScriptException();
      return 0;
    }
    try {
      return std::stoull(s, nullptr, 16);
    } catch (...) {
      Napi::TypeError::New(env, "networkId must be hex string").ThrowAsJavaScriptException();
      return 0;
    }
  }

  if (value.IsNumber()) {
    double d = value.As<Napi::Number>().DoubleValue();
    if (d < 0 || d > static_cast<double>(UINT64_MAX)) {
      Napi::TypeError::New(env, "networkId number out of uint64 range")
        .ThrowAsJavaScriptException();
      return 0;
    }
    return static_cast<uint64_t>(d);
  }

  Napi::TypeError::New(env, "networkId must be bigint, number or hex string")
    .ThrowAsJavaScriptException();
  return 0;
}

bool ip_allowed(const std::string& ip) {
  if (g_proxy_allow_ips.empty()) {
    return true;
  }
  return std::find(g_proxy_allow_ips.begin(), g_proxy_allow_ips.end(), ip) != g_proxy_allow_ips.end();
}

void log_proxy(const std::string& msg) {
  if (!g_proxy_log) {
    return;
  }
  std::fprintf(stderr, "[libzt-proxy] %s\n", msg.c_str());
}

bool pump_tcp_to_zt(SOCKET tcp_sock, int zt_sock) {
  char buf[8192];
  for (;;) {
    int n = recv(tcp_sock, buf, sizeof(buf), 0);
    if (n <= 0) {
      return false;
    }
    int sent = 0;
    while (sent < n) {
      int w = g_zts_send(zt_sock, buf + sent, n - sent, 0);
      if (w <= 0) {
        return false;
      }
      sent += w;
    }
  }
}

bool pump_zt_to_tcp(int zt_sock, SOCKET tcp_sock) {
  char buf[8192];
  for (;;) {
    int n = g_zts_recv(zt_sock, buf, sizeof(buf), 0);
    if (n <= 0) {
      return false;
    }
    int sent = 0;
    while (sent < n) {
      int w = send(tcp_sock, buf + sent, n - sent, 0);
      if (w <= 0) {
        return false;
      }
      sent += w;
    }
  }
}

void handle_proxy_connection(int zt_client_fd,
                             const std::string& target_host,
                             uint16_t target_port,
                             const std::string& client_ip) {
  SOCKET tcp_sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (tcp_sock == INVALID_SOCKET) {
    g_zts_close(zt_client_fd);
    return;
  }

  int timeout = g_proxy_idle_timeout_ms;
  setsockopt(tcp_sock, SOL_SOCKET, SO_RCVTIMEO, reinterpret_cast<const char*>(&timeout), sizeof(timeout));
  setsockopt(tcp_sock, SOL_SOCKET, SO_SNDTIMEO, reinterpret_cast<const char*>(&timeout), sizeof(timeout));

  sockaddr_in target_addr{};
  target_addr.sin_family = AF_INET;
  target_addr.sin_port = htons(target_port);
  if (inet_pton(AF_INET, target_host.c_str(), &target_addr.sin_addr) != 1) {
    closesocket(tcp_sock);
    g_zts_close(zt_client_fd);
    return;
  }

  if (connect(tcp_sock, reinterpret_cast<sockaddr*>(&target_addr), sizeof(target_addr)) != 0) {
    log_proxy("connect local target failed from " + client_ip);
    closesocket(tcp_sock);
    g_zts_close(zt_client_fd);
    return;
  }

  log_proxy("accepted " + client_ip + " active=" + std::to_string(g_proxy_active_connections.load()));

  std::atomic<bool> alive{true};
  std::thread t1([&]() {
    if (!pump_zt_to_tcp(zt_client_fd, tcp_sock)) {
      alive = false;
      shutdown(tcp_sock, SD_BOTH);
      g_zts_close(zt_client_fd);
    }
  });
  std::thread t2([&]() {
    if (!pump_tcp_to_zt(tcp_sock, zt_client_fd)) {
      alive = false;
      shutdown(tcp_sock, SD_BOTH);
      g_zts_close(zt_client_fd);
    }
  });

  t1.join();
  t2.join();

  closesocket(tcp_sock);
  g_zts_close(zt_client_fd);
  log_proxy("closed " + client_ip + " active=" + std::to_string(g_proxy_active_connections.load()));
}

void accept_loop(uint16_t listen_port, std::string target_host, uint16_t target_port) {
  int fd = g_zts_socket(AF_INET, SOCK_STREAM, 0);
  if (fd < 0) {
    g_proxy_running = false;
    return;
  }

  {
    std::lock_guard<std::mutex> lk(g_proxy_mutex);
    g_proxy_listener = fd;
  }

  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_port = htons(listen_port);
  addr.sin_addr.s_addr = htonl(INADDR_ANY);

  if (g_zts_bind(fd, reinterpret_cast<sockaddr*>(&addr), static_cast<int>(sizeof(addr))) != 0) {
    g_zts_close(fd);
    g_proxy_running = false;
    return;
  }
  if (g_zts_listen(fd, 128) != 0) {
    g_zts_close(fd);
    g_proxy_running = false;
    return;
  }

  while (g_proxy_running.load()) {
    sockaddr_in client_addr{};
    int client_len = static_cast<int>(sizeof(client_addr));
    int client_fd = g_zts_accept(fd, reinterpret_cast<sockaddr*>(&client_addr), &client_len);
    if (client_fd < 0) {
      Sleep(40);
      continue;
    }
    char ipbuf[INET_ADDRSTRLEN] = {0};
    inet_ntop(AF_INET, &client_addr.sin_addr, ipbuf, sizeof(ipbuf));
    std::string client_ip = ipbuf[0] ? std::string(ipbuf) : std::string("unknown");

    if (!ip_allowed(client_ip)) {
      log_proxy("blocked by allowlist: " + client_ip);
      g_zts_close(client_fd);
      continue;
    }

    int now_active = g_proxy_active_connections.load();
    if (now_active >= g_proxy_max_connections) {
      log_proxy("rejected by maxConnections: " + client_ip);
      g_zts_close(client_fd);
      continue;
    }
    g_proxy_active_connections.fetch_add(1);
    std::thread([client_fd, target_host, target_port, client_ip]() {
      handle_proxy_connection(client_fd, target_host, target_port, client_ip);
      g_proxy_active_connections.fetch_sub(1);
    }).detach();
  }

  g_zts_close(fd);
  {
    std::lock_guard<std::mutex> lk(g_proxy_mutex);
    g_proxy_listener = -1;
  }
}

Napi::Value Loaded(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), g_lib != nullptr);
}

Napi::Value Load(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "load(path) requires dll path string").ThrowAsJavaScriptException();
    return env.Null();
  }

  if (g_lib != nullptr) {
    return Napi::Boolean::New(env, true);
  }

  std::u16string utf16 = info[0].As<Napi::String>().Utf16Value();
  std::wstring path(utf16.begin(), utf16.end());
  g_lib = LoadLibraryW(path.c_str());
  if (!g_lib) {
    Napi::Error::New(env, "Failed to load libzt.dll").ThrowAsJavaScriptException();
    return env.Null();
  }

  g_zts_node_start = reinterpret_cast<zts_node_start_fn>(GetProcAddress(g_lib, "zts_node_start"));
  g_zts_node_stop = reinterpret_cast<zts_node_stop_fn>(GetProcAddress(g_lib, "zts_node_stop"));
  g_zts_net_join = reinterpret_cast<zts_net_join_fn>(GetProcAddress(g_lib, "zts_net_join"));
  g_zts_net_transport_is_ready =
    reinterpret_cast<zts_net_transport_is_ready_fn>(GetProcAddress(g_lib, "zts_net_transport_is_ready"));
  g_zts_node_get_id = reinterpret_cast<zts_node_get_id_fn>(GetProcAddress(g_lib, "zts_node_get_id"));

  g_zts_socket = reinterpret_cast<zts_socket_fn>(GetProcAddress(g_lib, "zts_socket"));
  g_zts_bind = reinterpret_cast<zts_bind_fn>(GetProcAddress(g_lib, "zts_bind"));
  g_zts_listen = reinterpret_cast<zts_listen_fn>(GetProcAddress(g_lib, "zts_listen"));
  g_zts_accept = reinterpret_cast<zts_accept_fn>(GetProcAddress(g_lib, "zts_accept"));
  g_zts_connect = reinterpret_cast<zts_connect_fn>(GetProcAddress(g_lib, "zts_connect"));
  g_zts_recv = reinterpret_cast<zts_recv_fn>(GetProcAddress(g_lib, "zts_recv"));
  g_zts_send = reinterpret_cast<zts_send_fn>(GetProcAddress(g_lib, "zts_send"));
  g_zts_close = reinterpret_cast<zts_close_fn>(GetProcAddress(g_lib, "zts_close"));

  if (!g_zts_node_start || !g_zts_node_stop || !g_zts_net_join ||
      !g_zts_net_transport_is_ready || !g_zts_node_get_id ||
      !g_zts_socket || !g_zts_bind || !g_zts_listen || !g_zts_accept ||
      !g_zts_connect || !g_zts_recv || !g_zts_send || !g_zts_close) {
    FreeLibrary(g_lib);
    g_lib = nullptr;
    reset_symbols();
    Napi::Error::New(env, "libzt.dll missing required symbols").ThrowAsJavaScriptException();
    return env.Null();
  }

  if (!ensure_winsock()) {
    FreeLibrary(g_lib);
    g_lib = nullptr;
    reset_symbols();
    Napi::Error::New(env, "WSAStartup failed").ThrowAsJavaScriptException();
    return env.Null();
  }

  return Napi::Boolean::New(env, true);
}

Napi::Value Unload(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (g_proxy_running.load()) {
    g_proxy_running = false;
    {
      std::lock_guard<std::mutex> lk(g_proxy_mutex);
      if (g_proxy_listener >= 0 && g_zts_close) {
        g_zts_close(g_proxy_listener);
      }
      g_proxy_listener = -1;
    }
    if (g_accept_thread.joinable()) {
      g_accept_thread.join();
    }
    g_proxy_active_connections = 0;
  }

  if (g_lib) {
    FreeLibrary(g_lib);
    g_lib = nullptr;
  }
  reset_symbols();
  g_proxy_allow_ips.clear();
  return Napi::Boolean::New(env, true);
}

Napi::Value NodeStart(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (!g_zts_node_start) {
    Napi::Error::New(env, "libzt not loaded").ThrowAsJavaScriptException();
    return env.Null();
  }
  return Napi::Number::New(env, g_zts_node_start());
}

Napi::Value NodeStop(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (!g_zts_node_stop) {
    Napi::Error::New(env, "libzt not loaded").ThrowAsJavaScriptException();
    return env.Null();
  }
  return Napi::Number::New(env, g_zts_node_stop());
}

Napi::Value NetJoin(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (!g_zts_net_join) {
    Napi::Error::New(env, "libzt not loaded").ThrowAsJavaScriptException();
    return env.Null();
  }
  if (info.Length() < 1) {
    Napi::TypeError::New(env, "netJoin(networkId) required").ThrowAsJavaScriptException();
    return env.Null();
  }

  uint64_t network_id = parse_network_id(info[0], env);
  if (env.IsExceptionPending()) {
    return env.Null();
  }

  return Napi::Number::New(env, g_zts_net_join(network_id));
}

Napi::Value NetTransportIsReady(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (!g_zts_net_transport_is_ready) {
    Napi::Error::New(env, "libzt not loaded").ThrowAsJavaScriptException();
    return env.Null();
  }
  if (info.Length() < 1) {
    Napi::TypeError::New(env, "netTransportIsReady(networkId) required")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  uint64_t network_id = parse_network_id(info[0], env);
  if (env.IsExceptionPending()) {
    return env.Null();
  }

  return Napi::Boolean::New(env, g_zts_net_transport_is_ready(network_id) == 1);
}

Napi::Value NodeGetId(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (!g_zts_node_get_id) {
    Napi::Error::New(env, "libzt not loaded").ThrowAsJavaScriptException();
    return env.Null();
  }
  return Napi::BigInt::New(env, g_zts_node_get_id());
}

Napi::Value StartTcpProxy(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (!g_lib) {
    Napi::Error::New(env, "libzt not loaded").ThrowAsJavaScriptException();
    return env.Null();
  }
  if (g_proxy_running.load()) {
    return Napi::Boolean::New(env, true);
  }
  if (info.Length() < 1 || !info[0].IsObject()) {
    Napi::TypeError::New(env, "startTcpProxy({ listenPort, targetHost, targetPort }) required")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  Napi::Object opts = info[0].As<Napi::Object>();
  int listen_port = opts.Get("listenPort").As<Napi::Number>().Int32Value();
  int target_port = opts.Get("targetPort").As<Napi::Number>().Int32Value();
  std::string target_host = opts.Has("targetHost")
    ? opts.Get("targetHost").ToString().Utf8Value()
    : "127.0.0.1";
  int max_connections = opts.Has("maxConnections")
    ? opts.Get("maxConnections").As<Napi::Number>().Int32Value()
    : 128;
  int idle_timeout_ms = opts.Has("idleTimeoutMs")
    ? opts.Get("idleTimeoutMs").As<Napi::Number>().Int32Value()
    : 120000;
  bool log_enabled = opts.Has("log")
    ? opts.Get("log").As<Napi::Boolean>().Value()
    : false;
  std::vector<std::string> allow_ips;
  if (opts.Has("allowIps") && opts.Get("allowIps").IsArray()) {
    Napi::Array arr = opts.Get("allowIps").As<Napi::Array>();
    uint32_t len = arr.Length();
    for (uint32_t i = 0; i < len; i += 1) {
      Napi::Value v = arr.Get(i);
      if (v.IsString()) {
        allow_ips.push_back(v.As<Napi::String>().Utf8Value());
      }
    }
  }

  if (listen_port <= 0 || listen_port > 65535 || target_port <= 0 || target_port > 65535) {
    Napi::TypeError::New(env, "listenPort/targetPort must be in 1..65535")
      .ThrowAsJavaScriptException();
    return env.Null();
  }
  if (max_connections <= 0) {
    Napi::TypeError::New(env, "maxConnections must be > 0").ThrowAsJavaScriptException();
    return env.Null();
  }
  if (idle_timeout_ms <= 0) {
    Napi::TypeError::New(env, "idleTimeoutMs must be > 0").ThrowAsJavaScriptException();
    return env.Null();
  }

  g_proxy_max_connections = max_connections;
  g_proxy_idle_timeout_ms = idle_timeout_ms;
  g_proxy_log = log_enabled;
  g_proxy_allow_ips = allow_ips;

  g_proxy_running = true;
  g_accept_thread = std::thread(accept_loop,
                                static_cast<uint16_t>(listen_port),
                                target_host,
                                static_cast<uint16_t>(target_port));
  return Napi::Boolean::New(env, true);
}

Napi::Value StopTcpProxy(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (!g_proxy_running.load()) {
    return Napi::Boolean::New(env, true);
  }

  g_proxy_running = false;
  {
    std::lock_guard<std::mutex> lk(g_proxy_mutex);
    if (g_proxy_listener >= 0 && g_zts_close) {
      g_zts_close(g_proxy_listener);
    }
    g_proxy_listener = -1;
  }
  if (g_accept_thread.joinable()) {
    g_accept_thread.join();
  }
  g_proxy_active_connections = 0;
  return Napi::Boolean::New(env, true);
}
}  // namespace

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("loaded", Napi::Function::New(env, Loaded));
  exports.Set("load", Napi::Function::New(env, Load));
  exports.Set("unload", Napi::Function::New(env, Unload));
  exports.Set("nodeStart", Napi::Function::New(env, NodeStart));
  exports.Set("nodeStop", Napi::Function::New(env, NodeStop));
  exports.Set("netJoin", Napi::Function::New(env, NetJoin));
  exports.Set("netTransportIsReady", Napi::Function::New(env, NetTransportIsReady));
  exports.Set("nodeGetId", Napi::Function::New(env, NodeGetId));
  exports.Set("startTcpProxy", Napi::Function::New(env, StartTcpProxy));
  exports.Set("stopTcpProxy", Napi::Function::New(env, StopTcpProxy));
  return exports;
}

NODE_API_MODULE(libztaddon, Init)
