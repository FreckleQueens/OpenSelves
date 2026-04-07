import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
	appId: "org.openselves.app",
	appName: "openselves-client",
	webDir: "build",
	// server: {
	// url: "http://10.0.2.2:5173",
	// cleartext: true,
	// },
	android: {
		path: "../android",
	},
};

export default config;
