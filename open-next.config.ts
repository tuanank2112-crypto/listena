import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// ListenAI does not opt into an OpenNext cache binding in the free deployment.
// Learner records remain in the explicit DB binding, never in the render cache.
export default defineCloudflareConfig({});
