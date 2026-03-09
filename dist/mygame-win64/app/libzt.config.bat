@echo off
rem Win x64 embedded libzt config
rem 1) Put libzt.dll at: third_party\libzt\winx64\libzt.dll
rem 2) Fill your ZeroTier network id below

set LIBZT_ENABLE=1
set LIBZT_STRICT=1
set LIBZT_NETWORK_ID=
set LIBZT_DLL_PATH=third_party\libzt\winx64\libzt.dll
set LIBZT_WAIT_MS=30000
set LIBZT_TCP_PROXY_ENABLE=1
set LIBZT_PROXY_PORT=3000
set LIBZT_PROXY_TARGET_HOST=127.0.0.1
set LIBZT_PROXY_MAX_CONNECTIONS=128
set LIBZT_PROXY_IDLE_TIMEOUT_MS=120000
set LIBZT_PROXY_LOG=0
set LIBZT_PROXY_ALLOW_IPS=
set APP_PORT_LOCAL=3000
