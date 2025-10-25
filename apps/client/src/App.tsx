import {
	BrowserRouter as Router,
	Routes,
	Route,
	Navigate,
} from "react-router-dom";
import Home from "./pages/Home";
import Landing from "./pages/Landing";
import { DesktopOnlyRoute } from "./routes/ProtectedRoute";
import "./App.css";

function App() {
	return (
		<Router>
			<Routes>
				{/* Landing page on home route - SEO optimized, accessible to all */}
				<Route path="/" element={<Landing />} />

				{/* Desktop-only canvas route for the app */}
				<Route
					path="/canvas"
					element={
						<DesktopOnlyRoute>
							<Home />
						</DesktopOnlyRoute>
					}
				/>

				{/* Catch all - redirect to home */}
				<Route path="*" element={<Navigate to="/" replace />} />
			</Routes>
		</Router>
	);
}

export default App;
