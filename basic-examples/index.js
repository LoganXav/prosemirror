import { EditorState, Plugin } from "prosemirror-state";
import { addListNodes } from "prosemirror-schema-list";
import { Decoration, DecorationSet, EditorView } from "prosemirror-view";
import { schema } from "prosemirror-schema-basic";
import { DOMParser, Fragment, Schema, Slice } from "prosemirror-model";
import { AddMarkStep, ReplaceStep } from "prosemirror-transform";

// This is a VERY small Redux-style ProseMirror architecture.
// Goal: The editor does NOT update itself directly but uses one central `dispatch()` function to handle app state updates and editor transactions.

let specklePlugin = new Plugin({
  state: {
    init(_, { doc }) {
      let speckles = [];
      for (let pos = 1; pos < doc.content.size; pos += 4)
        speckles.push(
          Decoration.inline(pos - 3, pos, { style: "background: yellow" }),
        );
      return DecorationSet.create(doc, speckles);
    },
    apply(tr, set) {
      return set.map(tr.mapping, tr.doc);
    },
  },
  props: {
    decorations(state) {
      return specklePlugin.getState(state);
    },
  },
});

// Resolved position examples plugin.
// state.selection.$from and $to are already resolved positions — no need to call doc.resolve() manually.
// This plugin reads $from on every state update to show cursor context in a status bar.
let cursorContextPlugin = new Plugin({
  view(editorView) {
    const status = document.createElement("div");
    status.id = "cursor-context";
    status.style.cssText =
      "padding: 6px 10px; font-size: 12px; color: #444; border: 1px solid #ddd; margin-top: 8px; font-family: monospace;";
    editorView.dom.parentNode.appendChild(status);

    function update(view) {
      const { $from, $cursor } = view.state.selection;

      // Build the ancestor path from doc down to the cursor's parent
      const path = [];
      let ancestorBefore = 0;
      let ancestorAfter = 0;
      for (let d = 0; d <= $from.depth; d++) {
        path.push($from.node(d).type.name);

        if (d !== 0) {
          ancestorBefore = $from.before(d);
          ancestorAfter = $from.after(d);
        }
      }

      // $from.parent is the immediate containing node (same as $from.node($from.depth))
      const parent = $from.parent.type.name;

      // $from.textOffset is how far into the current text node the cursor is
      const textOffset = $from.textOffset;

      // $from.start() and $from.end() give the absolute positions bounding the parent node
      const parentStart = $from.start();
      const parentEnd = $from.end();

      // nodeBefore/nodeAfter are the nodes immediately before/after the cursor within the parent
      const before = $from.nodeBefore ? $from.nodeBefore.type.name : "none";
      const after = $from.nodeAfter ? $from.nodeAfter.type.name : "none";

      status.innerHTML = `
        <b>path:</b> ${path.join(" &rsaquo; ")} |
        <b>pos:</b> ${$from.pos} |

        <b>parent:</b> ${parent} |
        <b>depth:</b> ${$from.depth} |
        <b>textOffset:</b> ${textOffset} |
        <b>parentStart:</b> ${parentStart} |
        <b>parentEnd:</b> ${parentEnd} |
        <b>ancestorBefore:</b> ${ancestorBefore} |
        <b>ancestorAfter:</b> ${ancestorAfter} |
        <b>nodeBefore:</b> ${before} |
        <b>nodeAfter:</b> ${after}
      `;
    }

    update(editorView);
    return { update };
  },
});

//   nodes: addListNodes(schema.spec.nodes, "paragraph block*", "block"),
// const extendedBasicSchema = new Schema({
//   marks: schema.spec.marks,
// });

const extendedBasicSchema = new Schema({
  // nodes: (schema.spec.nodes),
  nodes: addListNodes(schema.spec.nodes, "paragraph block*", "block"),
  marks: schema.spec.marks,
});

let appState = {
  editor: EditorState.create({
    schema: extendedBasicSchema,
    doc: DOMParser.fromSchema(extendedBasicSchema).parse(
      document.querySelector("#content"),
    ),
    plugins: [specklePlugin, cursorContextPlugin],
  }),

  // non-editor app state
  aiGeneratiionStatus: "idle",
};

function dispatch(action) {
  console.log("DISPATCH:", action.type);

  switch (action.type) {
    // proseMirror transaction from editor
    case "EDITOR_TRANSACTION": {
      const tr = action.transaction;

      if (appState.aiGeneratiionStatus === "generating") {
        console.log("User typed → cancel AI generation");
        appState.aiGeneratiionStatus = "idle";
      }

      // apply transaction to derive new editor state
      appState.editor = appState.editor.apply(tr);

      break;
    }

    // external app event
    case "AI_START": {
      appState.aiGeneratiionStatus = "generating";
      break;
    }

    case "AI_STOP": {
      appState.aiGeneratiionStatus = "idle";
      break;
    }

    case "REPLACE": {
      const tr = appState.editor.tr;
      const textNode = appState.editor.schema.text(action.text);
      const fragment = Fragment.from(textNode);
      const slice = new Slice(fragment, 0, 0);

      const step = new ReplaceStep(1, 6, slice);

      tr.step(step);
      //
      // Using helper functions
      // tr.replaceWith(1, 5, fragment);
      // tr.delete(1, 5);
      // tr.replace(1, 5, slice);

      appState.editor = appState.editor.apply(tr);
      break;
    }

    case "NESTED_REPLACE": {
      const doc = appState.editor.doc;
      const tr = appState.editor.tr;

      let fromPos = null;
      let toPos = null;

      let listItemCount = 0;

      doc.descendants((node, pos, parent) => {
        if (
          node.type.name === "paragraph" &&
          parent.type.name === "blockquote" &&
          fromPos === null
        ) {
          fromPos = pos + 1 + Math.floor(node.content.size / 2);
        }
        if (
          node.type.name === "list_item" &&
          parent.type.name === "ordered_list" &&
          toPos === null
        ) {
          listItemCount++;
          if (listItemCount === 2) {
            toPos = pos + 1 + Math.floor(node.content.size / 2);
          }
        }
      });

      if (fromPos === null || toPos === null) break;

      // fromPos is mid-paragraph → 1 node boundary was cut → openStart: 1
      // toPos is mid-blockquote>paragraph → 2 node boundaries were cut → openEnd: 2
      //
      // The fragment mirrors that open structure:
      //   first node: paragraph (open at start — merges with paragraph content before fromPos)
      //   last node: blockquote > paragraph (open at end — merges with blockquote paragraph content after toPos)
      const slice = new Slice(
        Fragment.from([
          appState.editor.schema.nodes.blockquote.create(
            null,
            appState.editor.schema.nodes.paragraph.create(
              null,
              appState.editor.schema.text("~inserted~"),
            ),
          ),
          appState.editor.schema.nodes.ordered_list.create(
            null,
            appState.editor.schema.nodes.list_item.create(
              null,
              appState.editor.schema.nodes.paragraph.create(
                null,
                appState.editor.schema.text("~inserted~"),
              ),
            ),
          ),
        ]),
        2, // openStart: paragraph boundary cut at the start
        3, // openEnd: blockquote + paragraph boundaries cut at the end
      );

      tr.step(new ReplaceStep(fromPos, toPos, slice));
      appState.editor = appState.editor.apply(tr);
      break;
    }
    case "BOLD": {
      const boldMark = appState.editor.schema.marks.strong.create();
      const { $from, $to } = appState.editor.selection;

      const tr = appState.editor.tr;

      const step = new AddMarkStep($from.pos, $to.pos, boldMark);
      tr.step(step);

      appState.editor = appState.editor.apply(tr);
      break;
    }

    default:
      break;
  }

  // after ALL updates, re-render UI to show updated state
  render();
}

function render() {
  view.updateState(appState.editor);

  document.querySelector("#ai-status").textContent =
    `AI Status: ${appState.aiGeneratiionStatus}`;
}

// node view first initializes all paragraph elements and renders a red border and then when the node is edited/updated changes the border to blue
class ParagraphView {
  constructor(node, view, getPos) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    this.dom = document.createElement("p");
    this.dom.style.borderBottom = "1px solid red";
    this.dom.style.padding = "4px";
    this.dom.style.width = "fit-content";

    this.contentDOM = this.dom;
  }

  update(node) {
    if (node.type.name !== "paragraph") return false;
    this.node = node;
    this.dom.style.borderBottom = "1px solid green";
    return true;
  }

  stopEvent() {
    return false;
  }
}

const view = new EditorView(document.querySelector("#editor"), {
  // editor state
  state: appState.editor,

  // node view register
  nodeViews: {
    paragraph(node, view, getPos) {
      return new ParagraphView(node, view, getPos);
    },
  },

  dispatchTransaction(transaction) {
    dispatch({
      type: "EDITOR_TRANSACTION",
      transaction,
    });
  },
});

// app buttons
document.querySelector("#bold").addEventListener("click", () => {
  dispatch({
    type: "BOLD",
  });
});

document.querySelector("#start-ai").addEventListener("click", () => {
  dispatch({
    type: "AI_START",
  });
});

document.querySelector("#stop-ai").addEventListener("click", () => {
  dispatch({
    type: "AI_STOP",
  });
});

document.querySelector("#replace").addEventListener("click", () => {
  dispatch({
    type: "REPLACE",
    text: "Hello",
  });
});

document.querySelector("#nested-replace").addEventListener("click", () => {
  dispatch({ type: "NESTED_REPLACE" });
});

// initial app render
// render();
//

// full document recursive traversal
let count = 0;
let positions = {};
appState.editor.doc.descendants((node, pos, parent) => {
  if (
    node.type === extendedBasicSchema.nodes.paragraph &&
    parent.type !== extendedBasicSchema.nodes.blockquote
  ) {
    count++;
    // keep in mind the pos is the one before the node's opening token
    const $from = appState.editor.doc.resolve(pos + 1);
    positions[count] = {
      startingFrom: $from.start(),
      endingAt: $from.end(),
    };
  }
  // don't look futher into the nodes subtree for performance
  return false;
});
// console.log({ count, positions });

// ranged recursive traversal
appState.editor.doc.nodesBetween(60, 170, (node, pos) => {
  if (
    node.isInline &&
    node.marks.some((mark) => mark.type === extendedBasicSchema.marks.strong)
  ) {
    console.log({ boldedText: node.text });
  }
  // cant prune here because we are looking for lower level inline content.
  // if i prune here, since the isInline will always be false for the first block layers,
  // we will always prune and never get to the texts
});

// only checks a node's direct children
appState.editor.doc.resolve(97).nodeAfter.forEach((child, offset, index) => {
  console.log(
    `child ${index}: ${child.type.name} at offset ${offset} from the start of the node`,
  );
});

// console.log(appState.editor.doc.resolve(28).nodeAfter);
