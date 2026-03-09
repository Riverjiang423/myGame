function getPing(_req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ok: true,
    ts: Date.now()
  });
}

module.exports = {
  getPing
};
