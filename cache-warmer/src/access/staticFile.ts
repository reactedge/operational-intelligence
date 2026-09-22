import express, {Application} from "express";
import {config} from "../config"

export const setupStaticFileAccess = (app: Application) => {
    // Expose versioned operational artefacts, such as prompts that guide the
    // AI-assisted cache-warming workflow. Keeping them in a read-only folder
    // makes the exact instructions used by a run traceable and reproducible.
    app.use(`/${config.cdnFolder}`, express.static(config.rootDir + config.cdnFolder));
}
