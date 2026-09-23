import {Application} from "express";
import {setupStatusRoutes} from "./status-router";
import {setupSitemapRoutes} from './sitemap-router';

export default (app: Application) => {
    setupStatusRoutes(app)
    setupSitemapRoutes(app)
}
