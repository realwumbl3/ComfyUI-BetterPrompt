import os

class BetterPromptNode:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "prompt": ("STRING", {"multiline": True, "dynamicPrompts": False, "default": ""}),
                "data": ("STRING", {"multiline": True, "default": ""}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("positive", "negative")
    FUNCTION = "process"
    CATEGORY = "BetterPrompt"

    def process(self, prompt, data):
        import json
        pos_parts = []
        neg_parts = []
        
        # Fallback to prompt string if no json data
        if not data:
            return (prompt, "")
            
        try:
            nodes = json.loads(data)
            for node in nodes:
                if node.get("hidden", False):
                    continue
                
                ntype = node.get("type", "")
                node_weight = node.get("weight", 1.0)
                
                if ntype == "text":
                    val = node.get("value", "").strip()
                    if not val:
                        continue
                    val = val.replace("\n", " ").replace("  ", " ")
                    if node_weight < 0:
                        neg_parts.append(val)
                    else:
                        if node_weight != 1.0:
                            pos_parts.append(f"({val}:{node_weight})")
                        else:
                            pos_parts.append(val)
                            
                elif ntype == "tags":
                    tags = node.get("value", [])
                    for tag in tags:
                        if isinstance(tag, str):
                            tval = tag.strip()
                            tweight = 1.0
                        elif isinstance(tag, dict):
                            tval = tag.get("value", "").strip()
                            tweight = tag.get("weight", 1.0)
                        else:
                            continue
                            
                        if not tval:
                            continue
                            
                        if tval.startswith("<") and tval.endswith(">"):
                            pos_parts.append(tval)
                            continue
                            
                        tval = tval.replace(" ", "_")
                        if tweight < 0:
                            neg_parts.append(tval)
                        else:
                            if tweight != 1.0:
                                pos_parts.append(f"({tval}:{tweight})")
                            else:
                                pos_parts.append(tval)
        except Exception as e:
            print(f"[BetterPrompt] Error parsing data: {e}")
            return (prompt, "")
            
        # Clean up commas like the frontend does
        import re
        pos_prompt = ", ".join(pos_parts)
        neg_prompt = ", ".join(neg_parts)
        pos_prompt = re.sub(r',(\s*,)+', ',', pos_prompt)
        neg_prompt = re.sub(r',(\s*,)+', ',', neg_prompt)
        
        return (pos_prompt, neg_prompt)

NODE_CLASS_MAPPINGS = {
    "BetterPrompt": BetterPromptNode
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BetterPrompt": "BetterPrompt Editor"
}
