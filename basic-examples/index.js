import { EditorState, Plugin } from "prosemirror-state";
import { Decoration, DecorationSet, EditorView } from "prosemirror-view";
import { schema } from "prosemirror-schema-basic";
import { DOMParser } from "prosemirror-model";

// This is a VERY small Redux-style ProseMirror architecture.
// Goal: The editor does NOT update itself directly but uses one central `dispatch()` function to handle app state updates and editor transactions.

let specklePlugin = new Plugin({
  state: {
    init(_, { doc }) {
      let speckles = [];
      console.log({ doc });
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

let appState = {
  editor: EditorState.create({
    schema,
    doc: DOMParser.fromSchema(schema).parse(document.querySelector("#content")),
    plugins: [specklePlugin],
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

// initial app render
// render();
