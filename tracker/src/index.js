import { createTrackerApp } from "./app.js";

const app = createTrackerApp();

export default {
  fetch(request) {
    return app.fetch(request);
  },
};
