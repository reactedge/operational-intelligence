import {Application} from "express";
import {setupFirstRoutes} from "./firstRouter";

export default (app: Application) => {
    setupFirstRoutes(app)
}