import { app } from "../../../scripts/app.js";
import zyX, { html, css } from "./betterprompt/zyX-es6.js";
import Editor, { recognizeData } from "./betterprompt/editor.js";

// Load original styles
css`@import url("/extensions/ComfyUI-BetterPrompt/betterprompt/styles.css");`;

// Additional tweaks to make it fit perfectly within a ComfyUI node and fix the collapsed layout
css`
.BetterPrompt-Internal-Container {
    font-family: "Source Sans Pro", ui-sans-serif, system-ui, sans-serif;
    background: transparent;
    color: white;
    width: 100% !important;
    height: 100% !important;
    display: flex !important;
    flex-direction: column !important;
    overflow: hidden !important;
}

.BetterPrompt-Internal-Container .BetterPromptContainer {
    width: 100% !important;
    height: 100% !important;
    min-height: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    overflow: hidden !important;
}

.BetterPrompt-Internal-Container .BetterPrompt {
    flex: 1 1 0 !important;
    min-height: 0 !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
}

.BetterPrompt-Internal-Container .MainEditor {
    flex: 1 1 auto !important;
    min-height: min-content !important;
    overflow: visible !important;
    display: flex !important;
    flex-direction: column !important;
}

.BetterPrompt {
    display: flex !important;
    flex-direction: column !important;
    border: none !important;
    background: transparent !important;
    height: 100% !important;
    min-height: 0 !important;
    padding: 0 !important;
    gap: 0 !important;
    resize: none !important;
    flex: 1 !important;
}

.Header {
    flex: 0 0 auto !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
}

/* Fix the NodeField so it expands to fill the node (ComfyUI embedded context only) */
.BetterPrompt-Internal-Container .NodeField {
    flex: 1 1 auto !important;
    height: auto !important;
    min-height: min-content !important;
    display: flex !important;
    flex-direction: column !important;
    overflow: visible !important;
}

.BetterPrompt-Internal-Container .NodeFieldList {
    flex: 1 1 auto !important;
    min-height: min-content !important;
    overflow: visible !important;
}

.BetterPrompt-Internal-Container .NodeFieldList::-webkit-scrollbar {
    width: 6px !important;
}

.BetterPrompt-Internal-Container .NodeFieldList::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2) !important;
    border-radius: 10px !important;
}

.EditorFooter {
    flex: 0 0 auto !important;
    padding: 10px !important;
    background: rgba(0, 0, 0, 0.2) !important;
}

.ResolutionPicker, .FitHeight {
    display: none !important;
}

/* Ensure all internal elements respect boundaries */
.BetterPrompt-Internal-Container * {
    box-sizing: border-box !important;
}

.Node {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
}

.NodeArea {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
}

textarea.BasicText {
    width: 100% !important;
    max-width: 100% !important;
    background: rgba(255, 255, 255, 0.05) !important;
    color: #eee !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    padding: 8px !important;
    border-radius: 4px !important;
    line-height: 1.4 !important;
    font-size: 13px !important;
}
`;

app.registerExtension({
    name: "ComfyUI.BetterPrompt",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "BetterPrompt") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

                // Set default size
                this.setSize([600, 450]);

                const promptWidget = this.widgets.find(w => w.name === "prompt");
                const dataWidget = this.widgets.find(w => w.name === "data");

                if (promptWidget) promptWidget.type = "hidden";
                if (dataWidget) dataWidget.type = "hidden";

                // Create a container DIV for the editor
                const editorContainer = document.createElement("div");
                editorContainer.className = "BetterPrompt-Internal-Container BetterPromptAssets";
                editorContainer.style.width = "100%";
                editorContainer.style.height = "100%";
                editorContainer.style.position = "absolute";
                editorContainer.style.top = "0";
                editorContainer.style.left = "0";
                editorContainer.style.pointerEvents = "auto";

                // Add the widget that handles the DOM
                const widget = this.addDOMWidget("betterprompt_editor", "HTML", editorContainer);

                // Override the widget's draw method to resize the internal editor
                const originalDraw = widget.draw;
                widget.draw = function (ctx, node, widget_width, y, widget_height) {
                    // Call original draw method
                    originalDraw.call(this, ctx, node, widget_width, y, widget_height);

                    // Resize the internal editor container to match the widget dimensions
                    if (editorContainer && editorContainer.style.display !== "none") {
                        const scale = ctx.getTransform().a;
                        const internalWidth = widget_width * scale;
                        const internalHeight = widget_height * scale;

                        // Update the editor container size
                        editorContainer.style.width = internalWidth + "px";
                        editorContainer.style.height = internalHeight + "px";

                        // Force layout recalculation for internal elements
                        const internalContainer = editorContainer.querySelector('.BetterPrompt-Internal-Container');
                        if (internalContainer) {
                            internalContainer.style.width = "100%";
                            internalContainer.style.height = "100%";

                            // Force the BetterPrompt editor to recalculate its layout
                            if (editor && editor.mainNodes) {
                                // Trigger any necessary layout updates in the editor
                                setTimeout(() => {
                                    if (editor.mainNodes.main) {
                                        editor.mainNodes.main.style.height = "100%";
                                    }
                                }, 0);
                            }

                            // Trigger a resize event to let internal components know about the size change
                            const resizeEvent = new Event('resize', { bubbles: false });
                            internalContainer.dispatchEvent(resizeEvent);
                        }
                    }
                };

                // Capture wheel events to prevent canvas zooming while scrolling the editor
                editorContainer.addEventListener("wheel", (e) => {
                    e.stopPropagation();
                }, { passive: false });

                // Initialize internal state storage
                const internalOutputs = { positive: "", negative: "" };

                // Initialize the Editor
                const editor = new Editor(editorContainer, {
                    positive: { value: "", addEventListener: () => { } }, // Dummy to let us capture output
                    skipDefault: true
                });
                this.better_prompt_editor = editor;

                // Capture output from editor
                const originalUpdateInput = editor.composePrompt;
                editor.composePrompt = async function () {
                    const pair = this.mainNodes.composePromptPair?.() ?? { positive: this.mainNodes.composePrompt(), negative: "" };
                    const positive = pair.positive;
                    internalOutputs.positive = positive;
                    internalOutputs.negative = pair.negative;

                    if (this.tokenCounter) {
                        const negative = pair.negative || "";
                        // Show a quick local estimate first so the UI isn't stuck at 0%
                        this.tokenCounter.updateCount(positive, negative);

                        // Use SwarmUI backend to get accurate token count if available
                        const genReq = window.genericRequest || window.parent?.genericRequest;
                        if (genReq) {
                            const baseParams = { skipPromptSyntax: true };
                            if (this.tokenCounter.tokenset) {
                                baseParams.tokenset = this.tokenCounter.tokenset;
                            }
                            const fetchCount = (text) => new Promise((resolve) => {
                                if (!text.trim()) return resolve(0);
                                genReq('TokenizeInDetail', { ...baseParams, text }, data => {
                                    resolve(data?.tokens ? data.tokens.length : null);
                                });
                            });
                            Promise.all([fetchCount(positive), fetchCount(negative)]).then(([posCount, negCount]) => {
                                const counts = {};
                                if (posCount !== null) counts.positive = posCount;
                                if (negCount !== null) counts.negative = negCount;
                                this.tokenCounter.updateCount(positive, negative, Object.keys(counts).length ? counts : null);
                            }).catch(() => {
                                this.tokenCounter.updateCount(positive, negative);
                            });
                        }
                    }

                    if (this.nodeValuePreview?.expanded) this.nodeValuePreview.refresh();
                    syncToComfy();
                }.bind(editor);

                // Sync function
                const syncToComfy = () => {
                    if (this.is_restoring_better_prompt) return;

                    const cleanPrompt = internalOutputs.positive;
                    const jsonState = JSON.stringify(editor.mainNodes.culmJson());

                    let changed = false;
                    if (promptWidget && promptWidget.value !== cleanPrompt) {
                        promptWidget.value = cleanPrompt;
                        if (promptWidget.callback) promptWidget.callback(promptWidget.value);
                        changed = true;
                    }
                    if (dataWidget && dataWidget.value !== jsonState) {
                        dataWidget.value = jsonState;
                        if (dataWidget.callback) dataWidget.callback(dataWidget.value);
                        changed = true;
                    }

                    if (changed) {
                        this.graph.setDirtyCanvas(true);
                        app.graph.setDirtyCanvas(true, true);
                    }
                };

                // Restoration logic
                this.restoreBetterPromptState = async () => {
                    const restoreSource = (dataWidget && dataWidget.value) ? dataWidget.value : (promptWidget ? promptWidget.value : null);

                    // Prevent duplicate restoration of the same state
                    if (this._last_restored_data === restoreSource && restoreSource !== null) return;
                    if (this.is_restoring_better_prompt) return;

                    this.is_restoring_better_prompt = true;
                    this._last_restored_data = restoreSource;

                    try {
                        if (!restoreSource) {
                            // If totally empty, add default tag
                            if (this.better_prompt_editor.mainNodes.nodes.length === 0) {
                                await this.better_prompt_editor.mainNodes.addByType("tags", { value: [""] });
                            }
                        } else {
                            const data = recognizeData(restoreSource);
                            if (data) {
                                await editor.mainNodes.loadJson(data);
                            } else {
                                // Fallback for raw legacy prompts
                                this.better_prompt_editor.mainNodes.clear();
                                await this.better_prompt_editor.mainNodes.addByType("text", { value: restoreSource });
                            }
                        }
                    } catch (e) {
                        console.error("[BetterPrompt] Load error:", e);
                        this._last_restored_data = undefined; // Reset on error to allow retry
                    } finally {
                        this.is_restoring_better_prompt = false;
                        await editor.composePrompt();
                    }
                };

                // Watch for changes in the editor
                editor.onNodesModified = () => {
                    editor.composePrompt();
                };

                // Trigger initial restore or default
                setTimeout(() => this.restoreBetterPromptState(), 50);

                // Hook configure to ensure we catch loaded data
                const onConfigure = this.onConfigure;
                this.onConfigure = function () {
                    if (onConfigure) onConfigure.apply(this, arguments);
                    setTimeout(() => this.restoreBetterPromptState(), 1);
                };

                return r;
            };
        }
    }
});

// Polyfill for addDOMWidget
if (!LGraphNode.prototype.addDOMWidget) {
    LGraphNode.prototype.addDOMWidget = function (name, type, element) {
        const node = this;
        const widget = {
            name,
            type,
            value: "",
            draw(ctx, node, widget_width, y, widget_height) {
                const transform = ctx.getTransform();
                const scale = transform.a;
                const tx = transform.e;
                const ty = transform.f;

                const x = node.pos[0] * scale + tx;
                const py = (node.pos[1] + y) * scale + ty;

                const visible = !node.flags.collapsed && app.canvas.ds.scale > 0.5;
                element.style.display = visible ? "block" : "none";
                element.style.width = (widget_width * scale) + "px";
                element.style.height = (widget_height * scale) + "px";
                element.style.left = x + "px";
                element.style.top = py + "px";
                element.style.position = "fixed";
                element.style.zIndex = "100";
            },
            computeSize(width) {
                return [width, node.size[1] - 30];
            },
            onRemove() {
                element.remove();
            }
        };
        this.addCustomWidget(widget);
        if (element.parentElement !== document.body) {
            document.body.appendChild(element);
        }
        return widget;
    };
}
