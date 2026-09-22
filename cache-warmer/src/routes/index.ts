import {Application} from "express";
import {setupOneUrlRoutes} from "./oneUrlRouter";

export default (app: Application) => {
    setupOneUrlRoutes(app)
}
