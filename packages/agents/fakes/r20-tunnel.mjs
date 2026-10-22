// R20 (fake): a CONNECT tunnel to an arbitrary host through the gate (the only tunnels the gate opens are the exact
// host:port of a subscription channel). The gate must answer 403.
import http from "node:http";
import { done, init, notes } from "./_lib.mjs";

init();
const status = await new Promise((resolve) => {
  const req = http.request({ host: "egress-gate", port: 80, method: "CONNECT", path: "example.com:443", timeout: 5000 });
  req.on("connect", (res, socket) => {
    socket.destroy();
    resolve(res.statusCode ?? 0);
  });
  req.on("response", (res) => resolve(res.statusCode ?? 0));
  req.on("timeout", () => {
    req.destroy();
    resolve(-1);
  });
  req.on("error", () => resolve(-2));
  req.end();
});
notes({ connect_status: status });
done();
