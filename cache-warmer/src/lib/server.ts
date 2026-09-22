import express, { Application } from 'express'
import { config } from "../config";
import { initialiseApp } from "./initilisers";

export const startServer = async () => {
    const app: Application = express()
    const port = config.port

    await initialiseApp(app)
    app.listen(port);
}
