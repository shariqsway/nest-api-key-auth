import { ApiKey } from "../interfaces";

declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKey;
    }
  }
}
