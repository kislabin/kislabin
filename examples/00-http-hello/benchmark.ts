import { check } from "k6";
import http from "k6/http";

export const options = {
  vus: 800,
  duration: "30s",
  thresholds: {
    http_req_failed: ["rate < 0.01"],
    http_req_duration: ["p(95) < 250"],
  },
};

export default function setup() {
  const response = http.get(`http://localhost:3000`);

  check(response, {
    "status code 200": (r) => r.status === 200,
  });
}
