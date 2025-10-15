import { Navigate } from "react-router-dom";
import { ReactNode } from "react";

interface ProtectedRouteProps {
	children: ReactNode;
}

// Detect if device is mobile
const isMobileDevice = () => {
	return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
		navigator.userAgent
	) || window.innerWidth < 768;
};

// Desktop-only route - redirects mobile users to /landing
export function DesktopOnlyRoute({ children }: ProtectedRouteProps) {
	if (isMobileDevice()) {
		return <Navigate to="/landing" replace />;
	}
	return <>{children}</>;
}

// Mobile-only route - allows access to /landing
export function MobileRoute({ children }: ProtectedRouteProps) {
	return <>{children}</>;
}
