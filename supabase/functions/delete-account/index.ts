import { getDenoRuntime } from "../_shared/http.ts";
import { handleDeleteAccountRequest } from "./handler.ts";

// Keep the wrapper: Deno.serve passes a second argument (connection info) that would otherwise
// be interpreted as the handler's `deps` parameter.
getDenoRuntime()?.serve((req: Request) => handleDeleteAccountRequest(req));
