import express from "express";
import { getallvideo, uploadvideo, getPremiumVideo } from "../controllers/video.js";
import upload from "../filehelper/filehelper.js";
import { requireSubscription } from "../middleware/subscriptionAuth.js";

const routes = express.Router();

routes.post("/upload", upload.single("file"), uploadvideo);
routes.get("/getall", getallvideo);
routes.get("/premium/:videoId", requireSubscription("BRONZE"), getPremiumVideo);

export default routes;
