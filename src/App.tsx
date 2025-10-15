import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home";
import Landing from "./pages/Landing";
import { DesktopOnlyRoute } from "./routes/ProtectedRoute";
import "./App.css";

function App() {
	return (
		<Router>
			<Routes>
				{/* Desktop-only home route - redirects mobile users to /landing */}
				<Route
					path="/"
					element={
						<DesktopOnlyRoute>
							<Home />
						</DesktopOnlyRoute>
					}
				/>
				
				{/* Mobile landing page */}
				<Route path="/landing" element={<Landing />} />
				
				{/* Catch all - redirect to home */}
				<Route path="*" element={<Navigate to="/" replace />} />
			</Routes>
		</Router>
	);
}

export default App;
