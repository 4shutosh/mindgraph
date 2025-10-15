import React from "react";
import "./MobileLanding.css";

const MobileLanding: React.FC = () => {
	return (
		<div className="mobile-landing">
			<div className="mobile-content">
				<h1>Think it out</h1>
				<div className="mobile-description">
					<p className="tagline">
						Build, study, and evolve your knowledge graph
					</p>
					<p className="intro">
						A knowledge graph/mindmap for decisions that repeat.
                        Reuse nodes, merge ideas, and explore how your thinking connects — without ever losing balance.
					</p>
					
					<div className="features">
						<img src="/demo.png" alt="ThinkItOut Demo" className="demo-image" />
                        <p className="feature-summary">
							Create hierarchical structures, link nodes across branches, and manage your knowledge with keyboard-first efficiency and drag-and-drop simplicity.
						</p>
					</div>
					
					<div className="desktop-notice">
						<p>
							This website is optimized for desktop use with keyboard navigation 
							and precise mouse interactions. Please open this website on a 
							desktop or laptop computer to get the full experience.
						</p>
					</div>
				</div>
			</div>
		</div>
	);
};

export default MobileLanding;

