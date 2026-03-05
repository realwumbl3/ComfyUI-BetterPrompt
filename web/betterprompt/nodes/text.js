import zyX, { html, css } from "../zyX-es6.js";
import Node from "../node.js";

export default class TextNode extends Node {
    constructor(editor, nodefield, initialJson) {
        super(editor, nodefield, {
            name: "Text Node",
            type: "text",
            value: "",
            ...initialJson,
        });

        const value = this.getJson().value;
        const storedHeight = this.getJson().height;

        html`
            <div this="text_header" class="TextHeader" style="display:flex; justify-content:flex-end; padding: 0.15em 0.4em; font-size: 0.85em; color: #aaa; background: rgba(0,0,0,0.1);">
                <span this="weight_indicator" class="WeightIndicator" zyx-mouseenter="${() => editor.setHint('Alt+Up / Alt+Down to adjust weight, Alt+- to negate weight')}">Weight: ${this.getJson().weight || 1}</span>
            </div>
            <textarea class="BasicText" this="textarea" style="height: ${storedHeight || '3em'}; width: 100%; white-space: pre-wrap; word-break: break-word; overflow-wrap: break-word; resize: vertical; overflow: auto; min-height: 50px;">${value}</textarea>
        `
            .join(this)
            .appendTo(this.nodearea);

        this.textarea.addEventListener("input", () => {
            const val = this.textarea.value;
            this.assignJson({ value: val });
            if (!this.getJson().height) {
                this.resizeToFitScrollheight();
            }
            this.callModified();
        });

        // Track manual resize
        this.resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                const newHeight = entry.target.style.height;
                if (newHeight && newHeight !== "0px" && newHeight !== "auto") {
                    if (this.getJson().height !== newHeight) {
                        this.assignJson({ height: newHeight });
                        this.callModified();
                    }
                }
            }
        });
        this.resizeObserver.observe(this.textarea);

        // Weight adjustment state
        this.weightAdjustInterval = null;
        this.adjustingWeight = false;

        const startWeightAdjustment = (direction) => {
            if (this.adjustingWeight) return;
            this.adjustingWeight = true;

            const adjustWeight = () => {
                let current_weight = this.getJson().weight;
                if (current_weight === undefined) current_weight = 1.0;
                let new_weight;
                if (direction === 'up') {
                    new_weight = Math.min(1.7, Number((current_weight + 0.05).toFixed(2)));
                } else {
                    new_weight = Math.max(-1.7, Number((current_weight - 0.05).toFixed(2)));
                }
                this.assignJson({ weight: new_weight });
                this.updateWeightUI();
            };

            // Initial adjustment
            adjustWeight();

            // Start continuous adjustment
            this.weightAdjustInterval = setInterval(adjustWeight, 100); // Adjust every 100ms
        };

        const stopWeightAdjustment = () => {
            if (this.weightAdjustInterval) {
                clearInterval(this.weightAdjustInterval);
                this.weightAdjustInterval = null;
            }
            this.adjustingWeight = false;
        };

        this.textarea.addEventListener("keydown", (e) => {
            if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
                startWeightAdjustment(e.key === "ArrowUp" ? 'up' : 'down');
                e.preventDefault();
            }
            if (e.altKey && e.key === "-") {
                // Negate the current weight (multiply by -1)
                let current_weight = this.getJson().weight;
                if (current_weight === undefined) current_weight = 1.0;
                let new_weight = Number((current_weight * -1).toFixed(2));
                this.assignJson({ weight: new_weight });
                this.updateWeightUI();
                e.preventDefault();
            }
        });

        this.textarea.addEventListener("keyup", (e) => {
            if ((e.key === "ArrowUp" || e.key === "ArrowDown") || !e.altKey) {
                stopWeightAdjustment();
            }
        });

        // Also listen for when Alt is released
        this.textarea.addEventListener("blur", () => {
            stopWeightAdjustment();
        });

        this.main.style.marginBottom = "10px";

        setTimeout(() => {
            if (!this.getJson().height) {
                this.resizeToFitScrollheight();
            }
            this.updateWeightUI();
        }, 10);
    }

    updateWeightUI() {
        let w = this.getJson().weight;
        if (w === undefined) w = 1.0;
        this.weight_indicator.innerText = "Weight: " + w;
        this.main.classList.toggle("Neutral", w === 1);
        this.main.classList.toggle("Positive", w > 1);
        this.main.classList.toggle("Negative", w < 1);
        this.callModified();
    }

    resizeToFitScrollheight() {
        if (this.getJson().height) return;
        this.textarea.style.height = "0px";
        const scrollHeight = this.textarea.scrollHeight;
        this.textarea.style.height = (scrollHeight + 10) + "px";
    }

    toPrompt() {
        if (this.isMuted()) return false;
        const value = this.getJson().value;
        return value.replace(/\\n/g, " ").replace(/,+/g, ",").replace(/  +/g, " ");
    }
}
