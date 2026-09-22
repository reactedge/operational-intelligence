import {Application} from "express";
import {setupCacheWarmerRoutes} from "./cacheWarmerRouter";

export default (app: Application) => {
    setupCacheWarmerRoutes(app)
}
