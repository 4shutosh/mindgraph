import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./MobileLanding.css";

const MobileLanding: React.FC = () => {
	const navigate = useNavigate();
	const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);

	useEffect(() => {
		const handleResize = () => {
			setIsDesktop(window.innerWidth >= 768);
		};
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, []);

	const handleGoToApp = () => {
		navigate("/canvas");
	};

	return (
		<div className="landing">
			<div className="landing-container">
				{/* Hero Section */}
				<header className="hero">
					<div className="badge">Mindmap + Graphs</div>
					<h1 className="hero-title">ThinkItOut</h1>
					<p className="hero-subtitle">
						Knowledge graphs for recurring decisions
					</p>
					<p className="hero-description">
						You're building a decision tree and realize this exact pattern already exists 
						somewhere else in your map. Traditional mindmaps force you to duplicate the 
						entire subtree. ThinkItOut lets you link to it once and reuse it everywhere.
					</p>
					{isDesktop && (
						<button onClick={handleGoToApp} className="cta-primary">
							Try it now
						</button>
					)}
				</header>

				{/* Demo Section */}
				<section className="demo-section">
					<div className="demo-container">
						<div className="demo-frame">
							{/* Replace with video later: <video src="/demo.mp4" controls loop muted autoPlay /> */}
							<img src="/demo.png" alt="ThinkItOut Interface" className="demo-media" />
						</div>
					</div>
				</section>

				{/* Value Props Section */}
				<section className="value-section">
					<h2 className="section-title">Built for how you actually think</h2>
					<div className="value-grid">
						<div className="value-item">
							<div className="value-number">01</div>
							<h3>Reusable Nodes</h3>
							<p>
								When the same decision appears in multiple contexts, link it once instead 
								of copying entire subtrees. Your thinking compounds without the clutter.
							</p>
						</div>
						<div className="value-item">
							<div className="value-number">02</div>
							<h3>Keyboard velocity</h3>
							<p>
								Tab to go deeper. Enter for siblings. Arrow keys to navigate. 
								Every action is a keystroke away—because thinking shouldn't wait for your mouse.
							</p>
						</div>
						<div className="value-item">
							<div className="value-number">03</div>
							<h3>Spatial intelligence</h3>
							<p>
								Drag to rearrange. Drop to reparent. The interface prevents circular 
								dependencies automatically, so you can focus on ideas, not constraints.
							</p>
						</div>
					</div>
				</section>

				{/* Mobile Notice */}
				{!isDesktop && (
					<section className="mobile-notice">
						<div className="notice-content">
							<svg className="notice-icon" width="48" height="48" viewBox="0 0 24 24" fill="none">
								<rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2"/>
								<path d="M8 21h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
								<path d="M12 17v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
							</svg>
							<h3>Desktop required</h3>
							<p>
								ThinkItOut is optimized for desktop workflows with keyboard shortcuts
								and precise interactions. Please visit on a laptop or desktop computer.
							</p>
						</div>
					</section>
				)}

				{/* Footer */}
				<footer className="landing-footer">
					<div className="footer-content">
						<p>For knowledge workers who think in systems</p>
					</div>
				</footer>
			</div>
		</div>
	);
};

export default MobileLanding;
