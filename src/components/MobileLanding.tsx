import React from "react";
import { useNavigate } from "react-router-dom";
import "./MobileLanding.css";

const MobileLanding: React.FC = () => {
	const navigate = useNavigate();

	const handleGoToApp = () => {
		navigate("/canvas");
	};

	// Check if user is on desktop (screen width >= 768px)
	const isDesktop = window.innerWidth >= 768;

	return (
		<div className="mobile-landing">
			<div className="mobile-content">
				<h1>Think it out</h1>
				<div className="mobile-description">
					<p className="tagline">
						Build, study, and evolve your knowledge graph
					</p>
					<p className="intro">
						A knowledge graph/mindmap for decisions that repeat. Reuse nodes,
						merge ideas, and explore how your thinking connects — without ever
						losing balance.
					</p>

					<div className="features">
						<img src="/demo.png" alt="ThinkItOut Demo" className="demo-image" />
						<p className="feature-summary">
							Create hierarchical structures, link nodes across branches, and
							manage your knowledge with keyboard-first efficiency and
							drag-and-drop simplicity.
						</p>
					</div>

					{isDesktop ? (
						<div className="desktop-cta">
							<button onClick={handleGoToApp} className="cta-button">
								Go to App →
							</button>
						</div>
					) : (
						<div className="desktop-notice">
							<p>
								This website is optimized for desktop use with keyboard
								navigation and precise mouse interactions. Please open this
								website on a desktop or laptop computer to get the full
								experience.
							</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default MobileLanding;
