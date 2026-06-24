import { makeViteConfig } from "openselves-common-ui/config";

export default makeViteConfig(5173, {
	preview: {
		proxy: {
			"^(/verify-email/.+/.+|/auth/recover-password/.+/.+)$": {
				target: "http://127.0.0.1:4173",
				rewrite() {
					return "/index.html";
				},
			},
		},
	},
});
