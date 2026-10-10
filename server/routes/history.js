import express from "express";
import {
  getallhistoryVideo,
  handlehistory,
  handleview,
  saveWatchProgress,
  getWatchProgress,
} from "../controllers/history.js";

const routes = express.Router();
routes.get("/:userId", getallhistoryVideo);
routes.post("/views/:videoId", handleview);
routes.post("/:videoId", handlehistory);

// Watch progress routes for custom video player
routes.post("/progress/:videoId", saveWatchProgress);
routes.get("/progress/:videoId", getWatchProgress);

export default routes;
