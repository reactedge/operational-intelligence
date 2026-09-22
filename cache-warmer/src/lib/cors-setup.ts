import {config} from "../config";
import cors from "cors"

export const corsOptions = () => {
    const allowedOrigins = config.frontendUrl
        .split(',')
        .map(origin => origin.trim())

    // The API is currently callable server-to-server. CORS is retained for the
    // planned browser-based operator UI and restricts it to configured origins.
    const options = {
        allowedHeaders: [
            'Origin',
            'Accept'
        ],
        credentials: true,
        methods: 'GET,HEAD,OPTIONS,PUT,PATCH,POST,DELETE',
        origin: allowedOrigins,
        preflightContinue: false,
    };

    return cors(options)
}
