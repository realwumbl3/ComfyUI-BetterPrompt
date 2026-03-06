import zyX, { html, sleep } from "./zyX-es6.js";
import { getNodeClass } from "./node.js";
import { updateInput } from "./util.js";
import NodeField, { getNodeField } from "./nodefield.js";
import Demo from "./demo.js";

export default class Editor {
    constructor(container, options = {}) {
        this.container = container;
        this.options = options;
        this.tabname = options.tabname || "generic";

        // Handle target textareas
        this.textarea = options.positive || container.querySelector("textarea#positive") || container.querySelector("textarea");
        this.negativetextarea = options.negative || container.querySelector("textarea#negative");

        if (this.textarea) {
            for (const textarea of [this.textarea, this.negativetextarea].filter(t => t)) {
                textarea.addEventListener("wheel", (e) => {
                    if (!textarea.matches(":focus")) e.preventDefault();
                });
            }
        }

        this.mainNodes = new NodeField(this);
        this.mainNodes.main.classList.add("MainNodes");

        this.dragState = {
            lastDragged: null,
            dragTarget: null,
        };

        this.BUTTONS = [
            {
                text: "export",
                tooltip: "Export the current prompt to your clipboard as json.",
                click: () => this.copyStateToClipboard() + this.setHint("Copied to clipboard."),
            },
            {
                text: "import",
                tooltip: "Import a prompt using normal / encoded json.",
                click: () => this.mainNodes.openImportWindow(),
            },
            {
                text: "load file",
                tooltip: "Load a prompt from a stable-diffusion output file (exif metadata), or a json file.",
                click: this.openSelectFile.bind(this),
            },
        ];

        this.clearPromptButton = new ClearPromptButton(this);
        this.betterPromptHint = new BetterPromptHintInfo(this);
        this.nodeValuePreview = new NodeValuePreview(this);
        this.tokenCounter = new TokenCounter(this);
        this.setHint = this.betterPromptHint.setHint.bind(this.betterPromptHint);

        html`
            <div class="BetterPromptContainer BetterPromptAssets">
                ${this.betterPromptHint}
                <div this="main" class="BetterPrompt">
                    ${this.nodeValuePreview}
                    <div
                        this="main_editor"
                        class="MainEditor"
                        zyx-dragenter="${(_) => this.dragEnter(_)}"
                        zyx-dragstart="${(_) => this.dragStart(_)}"
                        zyx-dragend="${(_) => this.dragEnd(_)}"
                        zyx-dragover="${(_) => this.dragState.dragTarget && _.e.preventDefault()}"
                    >
                        ${this.mainNodes}
                    </div>
                    <div class="EditorFooter">
                        <div class="leftSide">
                            <div class="Column">
                                <div class="Row Status">
                                    <div class="Status"></div>
                                </div>
                                <div class="Row Manage">
                                    ${this.clearPromptButton}
                                    ${this.BUTTONS.map((button) => new EditorButton(this, button))}
                                </div>
                            </div>
                        </div>
                        <div class="rightSide">
                            ${this.tokenCounter}
                        </div>
                    </div>
                </div>
            </div>
        `
            .bind(this)
            .appendTo(this.container);

        this.mainNodes.addModifiedEventListener(() => this.onNodesModified());

        this.asyncConstructor();
    }

    async asyncConstructor() {
        if (this.options.skipDefault) return;
        this.mainNodes.addByType("tags", { value: [""] });
    }


    copyStateToClipboard() {
        navigator.clipboard.writeText(JSON.stringify(this.mainNodes.culmJson(), null, 1));
    }

    onNodesModified(event, e) {
        this.composePrompt();
    }

    dragEnter(e) {
        if (!this.dragState.dragTarget) return true;
        e.e.preventDefault();
        const node = e.e.target.closest(".Node");
        if (!node || this.dragState.lastDragged === node) return;
        if (this.dragState.dragTarget.contains(node)) return highlightNode(this.dragState.dragTarget, "red");
        this.dragState.lastDragged = node;
        highlightNode(this.dragState.lastDragged, "cyan");
    }

    dragStart(e) {
        if (!e.e.target?.matches(".Thumb")) return true;
        this.dragState.dragTarget = e.e.target.closest(".Node");
    }

    dragEnd(e) {
        if (!this.dragState.dragTarget) return true;
        e.e.preventDefault();
        if (!this.dragState.lastDragged) return this.dragReset();
        if (this.dragState.lastDragged !== this.dragState.dragTarget) this.dragReorder(e);
        this.dragReset();
    }

    dragReset() {
        this.dragState.lastDragged = null;
        this.dragState.dragTarget = null;
    }

    dragReorder(e) {
        const { lastDragged, dragTarget } = this.dragState;
        const draggedNodeField = getNodeField(dragTarget.closest(".NodeField"));
        const draggedDomArray = draggedNodeField.nodefield.liveDomList;
        const draggedNode = draggedDomArray.get(dragTarget);
        if (!draggedNode) return;
        const targetNodeField = getNodeField(lastDragged.closest(".NodeField"));
        const targetDomArray = targetNodeField.nodefield.liveDomList;
        const targetNode = targetDomArray.get(lastDragged);
        if (targetNode.type === "group" && targetNode.field.nodes.length < 1) {
            draggedNode.moveNodefields(targetNode.field, 0);
            targetNode.field.insertNode(draggedNode, 0);
            return;
        }
        const heightHalf = lastDragged.offsetHeight / 2;
        const nodeFieldRect = lastDragged.getBoundingClientRect();
        const atBottomHalf = e.clientY - nodeFieldRect.top > heightHalf;
        draggedNode.moveNodefields(targetNodeField);
        const targetNodeIndex = targetNodeField.nodes.indexOf(targetNode);
        const newIndex = targetNodeIndex + (atBottomHalf ? 1 : 0);
        targetNodeField.insertNode(draggedNode, newIndex);
    }

    loadDemoState() {
        this.mainNodes.loadJson(Demo);
    }



    loadJson(json) {
        this.mainNodes.loadJson(json);
    }

    async openSelectFile() {
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.addEventListener("change", async () => {
            const file = fileInput.files[0];
            const reader = new FileReader();
            reader.onload = async () => {
                const fileContent = reader.result?.replace(/\0/g, ""); // remove null bytes (jpeg exif)
                fileContent && this.loadJson(fileContent);
            };
            reader.readAsText(file);
            fileInput.remove();
        });
        fileInput.style.display = "none";
        document.body.appendChild(fileInput);
        fileInput.click();
    }

    async composePrompt() {
        const pair = this.mainNodes.composePromptPair?.() ?? { positive: this.mainNodes.composePrompt(), negative: "" };
        const prompt = pair.positive;

        if (this.tokenCounter) {
            this.tokenCounter.updateCount(pair.positive, pair.negative);
        }

        if (this.textarea) {
            await updateInput(this.textarea, prompt);
        } else {
            console.log("[BetterPrompt] Composed prompt:", prompt);
        }
    }
}

export function recognizeData(data) {
    if (typeof data === "string" && (data.startsWith("[") || data.startsWith("{"))) {
        try {
            data = JSON.parse(data);
        } catch (e) { return null; }
    }
    if (!Array.isArray(data)) return null;
    return data;
}

function highlightNode(node, color) {
    node.classList.add("highlighted");
    node.style.setProperty("--highlight-color", color || "orange");
    zyX(node).delay("highlight", 300, () => {
        node.classList.remove("highlighted");
        node.style.removeProperty("--highlight-color");
    });
}

class NodeValuePreview {
    constructor(editor) {
        this.editor = editor;
        this.expanded = false;
        const opts = editor.options?.getPreviewValues || {};
        const getPair = () => editor.mainNodes.composePromptPair?.() ?? { positive: editor.mainNodes.composePrompt(), negative: "" };
        this.getPositive = opts.positive ?? (() => getPair().positive);
        this.getNegative = opts.negative ?? (() => getPair().negative);
        html`
            <div this="main" class="NodeValuePreview">
                <div
                    this="toggle"
                    class="NodeValuePreviewToggle Button"
                    zyx-click="${this.toggle.bind(this)}"
                    zyx-mouseenter="${(_) => editor.setHint("Toggle node value preview", { ml: this.toggle })}"
                >
                    <span this="label">toggle vis</span>
                </div>
                <div this="panel" class="NodeValuePreviewPanel" style="display: none;">
                    <div this="positiveBox" class="NodeValuePreviewBox NodeValuePreviewPositive">
                        <div class="NodeValuePreviewLabel">Positive</div>
                        <pre this="positiveText" class="NodeValuePreviewText"></pre>
                    </div>
                    <div this="negativeBox" class="NodeValuePreviewBox NodeValuePreviewNegative">
                        <div class="NodeValuePreviewLabel">Negative</div>
                        <pre this="negativeText" class="NodeValuePreviewText"></pre>
                    </div>
                </div>
            </div>
        `.bind(this);
    }

    toggle() {
        this.expanded = !this.expanded;
        this.panel.style.display = this.expanded ? "flex" : "none";
        this.toggle.classList.toggle("active", this.expanded);
        if (this.expanded) this.refresh();
    }

    refresh() {
        if (!this.expanded) return;
        const pos = typeof this.getPositive === "function" ? this.getPositive() : this.getPositive ?? "";
        const neg = typeof this.getNegative === "function" ? this.getNegative() : this.getNegative ?? "";
        this.positiveText.textContent = pos || "(empty)";
        this.negativeText.textContent = neg || "(empty)";
    }
}

class EditorButton {
    constructor(editor, { text, tooltip, click } = {}) {
        this.editor = editor;
        this.text = text;
        this.click = click;
        this.tooltip = tooltip || "";
        html`
            <div
                this="main"
                class="Button"
                zyx-click="${this.onClick.bind(this)}"
                zyx-mouseenter="${(_) => editor.setHint(this.tooltip, { ml: this.main })}"
            >
                ${this.text}
            </div>
        `.bind(this);
    }

    onClick() {
        this.click();
    }
}

class ClearPromptButton {
    constructor(editor) {
        html`
            <div
                this="main"
                class="ClearPrompt Button"
                zyx-mouseenter="${(_) => editor.setHint("Clear the prompt.", { ml: this.main })}"
            >
                <div this="clear" class="Button" zyx-click="${(_) => this.main.classList.add("active")}">Clear</div>
                <div this="cancel" class="Button Cancel" zyx-click="${(_) => this.main.classList.remove("active")}">
                    No
                </div>
                <div
                    this="confirm"
                    class="Button Confirm"
                    zyx-click="${(_) => editor.mainNodes.clear() + this.main.classList.remove("active")}"
                >
                    Yes
                </div>
            </div>
        `.bind(this);
    }
}

class BetterPromptHintInfo {
    constructor(editor) {
        this.editor = editor;
        html`
            <div this="main" class="BetterPromptHintInfo">
                <div this="hint" class="Hint"><span></span><span this="tooltip"></span></div>
                <div this="info" class="Info"></div>
            </div>
        `.bind(this);
    }

    setHint(text, { ml, duration } = {}) {
        this.tooltip.innerText = text;
        zyX(this.tooltip).delay("tooltip", duration || 2000, () => {
            this.tooltip.innerText = "";
        });
        ml && ml.addEventListener("mouseleave", () => zyX(this.tooltip).instant("tooltip"), { once: true });
    }
}

class TokenCounter {
    constructor(editor) {
        this.editor = editor;
        this.maxTokens = 512;
        this.tokenset = "t5";
        this.enabled = true;
        this.lastPositive = "";
        this.lastNegative = "";

        html`
            <div this="main" class="TokenCounter">
                <select this="modelSelect" class="TokenCounterSelect Button" zyx-change="${this.onModelChange.bind(this)}">
                    <option value="512" data-tokenset="t5">Wan 2.2 (512)</option>
                    <option value="256" data-tokenset="clip">Flux/SD3 (256)</option>
                    <option value="77" data-tokenset="clip">SDXL (77)</option>
                    <option value="75" data-tokenset="clip">SD 1.5 (75)</option>
                    <option value="-1">Disabled</option>
                </select>
                <div this="textDisplay" class="TokenCounterText">
                    0 / 512 (0%)
                </div>
            </div>
        `.bind(this);
    }

    onModelChange(e) {
        const val = parseInt(this.modelSelect.value);
        if (val === -1) {
            this.enabled = false;
            this.textDisplay.style.display = "none";
        } else {
            this.enabled = true;
            this.maxTokens = val;
            this.tokenset = this.modelSelect.selectedOptions[0]?.dataset.tokenset || "clip";
            this.textDisplay.style.display = "block";
        }
        this.updateCount(this.lastPositive, this.lastNegative);
    }

    updateCount(positive = "", negative = "", manualCounts = null) {
        this.lastPositive = positive || "";
        this.lastNegative = negative || "";
        if (!this.enabled) return;

        const est = (text) => (text.match(/[\w]+|[^\s\w]/g) || []).length;
        let posCount = manualCounts?.positive ?? est(this.lastPositive);
        let negCount = manualCounts?.negative ?? est(this.lastNegative);

        const posPercent = Math.round((posCount / this.maxTokens) * 100);
        const negPercent = Math.round((negCount / this.maxTokens) * 100);
        const maxPercent = Math.max(posPercent, negPercent);

        let text;
        if (!this.lastNegative.trim()) {
            text = `${posCount} / ${this.maxTokens} (${posPercent}%)`;
            if (this.tokenset === "clip" && this.maxTokens <= 77) {
                const chunks = Math.ceil(posCount / this.maxTokens);
                text += chunks > 1 ? ` [${chunks} chunks]` : (posCount > 0 ? " [1 chunk]" : "");
            }
        } else {
            const fmt = (c, pct) => {
                let s = `${c}/${this.maxTokens}`;
                if (this.tokenset === "clip" && this.maxTokens <= 77 && c > 0) {
                    const ch = Math.ceil(c / this.maxTokens);
                    s += ch > 1 ? ` [${ch}]` : " [1]";
                }
                return s;
            };
            text = `pos ${fmt(posCount, posPercent)} · neg ${fmt(negCount, negPercent)}`;
        }

        this.textDisplay.textContent = text;

        if (maxPercent > 100) {
            this.textDisplay.style.color = "#ef4444"; // red
        } else if (maxPercent > 80) {
            this.textDisplay.style.color = "#f97316"; // orange
        } else {
            this.textDisplay.style.color = "#aaa"; // default
        }
    }
}

