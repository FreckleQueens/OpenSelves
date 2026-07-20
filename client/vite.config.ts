import { makeViteConfig } from "openselves-common-ui/config";

export default makeViteConfig(5173, {
	preview: {
		proxy: {
			"^(/verify-email/.+/.+|/auth/recover-password/.+/.+)$": {
				target: "https://localhost:4173",
				rewrite() {
					return "/index.html";
				},
			},
		},
	},
});
