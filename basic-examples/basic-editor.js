import { exampleSetup } from "prosemirror-example-setup";
import { keymap } from "prosemirror-keymap";
import { AddMarkStep, ReplaceStep } from "prosemirror-transform";
import { TextSelection } from "prosemirror-state";
import { findWrapping } from "prosemirror-transform";

import { DOMParser, Fragment, Schema, Slice } from "prosemirror-model";

import { schema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

const nodeSpec = {
  group: "",
  content: "",
  attrs: "",
  toDOM: (node) => {},
  parseDOM: [],
};

const markSpec = {
  attrs: {},
  toDOM: (node) => {},
  parseDOM: [],
};

const emMarkSpec = {
  toDOM: () => {
    return ["em", 0];
  },
  parseDOM: [{ tag: "em" }, { tag: "i" }],
};

const linkMarkSpec = {
  attrs: {
    href: {
      default: "",
      validate: "string",
    },
    title: {
      default: null,
      validate: "string|null",
    },
  },
  toDOM: (node) => {
    let { href, title } = node.attrs;
    return ["a", { href, title }, 0];
  },
  parseDOM: [
    {
      tag: "a",
      getAttrs: (dom) => {
        let href = dom.hasAttribute("href") ? dom.getAttribute("href") : "";
        let title = dom.hasAttribute("title")
          ? dom.getAttribute("title")
          : null;

        return { href, title };
      },
    },
  ],
};

const listItemNodeSpec = {
  content: "paragraph block*",
  attrs: {},
  toDOM: () => {
    return ["li", 0];
  },
  parseDOM: [{ tag: "li" }],
};

const bulletListNodeSpec = {
  group: "block",
  content: "list_item+",
  toDOM: () => {
    return ["ul", 0];
  },
  parseDOM: [{ tag: "ul" }],
};

const orderedListNodeSpec = {
  group: "block",
  attrs: {
    order: {
      default: 1,
      validate: "number",
    },
  },
  content: "list_item+",
  toDOM: (node) => {
    return node.attrs.order == 1
      ? ["ol", 0]
      : ["ol", { start: node.attrs.order }, 0];
  },
  parseDOM: [
    {
      tag: "ol",
      getAttrs: (dom) => {
        return {
          order: dom.hasAttribute("start")
            ? Number(dom.getAttribute("start"))
            : 1,
        };
      },
    },
  ],
};

const paragraphNodeSpec = {
  group: "block",
  content: "inline*",
  toDOM: () => {
    return ["p", 0];
  },
  parseDOM: [{ tag: "p" }],
};

const textNodeSpec = {
  group: "inline",
};

const headingNodeSpec = {
  group: "block",
  content: "inline*",
  attrs: {
    level: {
      default: 1,
      validate: "number",
    },
  },
  toDOM: (node) => {
    return ["h" + node.attrs.level, 0];
  },
  parseDOM: [
    { tag: "h1", attrs: { level: 1 } },
    { tag: "h2", attrs: { level: 2 } },
  ],
};

const cardSpec = {
  group: "block",
  content: "card_title card_body",
  attrs: {
    kind: { default: "info", validate: "string" },
  },
  toDOM(node) {
    return ["div", { class: `card card-${node.attrs.kind}` }, 0];
  },
  parseDOM: [
    {
      tag: "div.card",
      getAttrs(dom) {
        const elementClass = dom.hasAttribute("class")
          ? dom.getAttribute("class")
          : null;

        const kindClass = elementClass
          .split(" ")
          .find((value) => value.startsWith("card-"));
        const kind = kindClass.split("-")[1];

        return { kind };
      },
    },
  ],
};

const cardTitleSpec = {
  group: "block",
  content: "inline*",
  toDOM() {
    return ["h3", { class: "card-title" }, 0];
  },
  parseDOM: [{ tag: "h3.card-title" }],
};

const cardBodySpec = {
  group: "block",
  content: "block*",
  toDOM() {
    return ["div", { class: "card-body" }, 0];
  },
  parseDOM: [{ tag: "div.card-body" }],
};

const docNodeSpec = {
  content: "block+",
};
const calloutNodeSpec = {
  group: "block",
  content: "callout_title callout_body", // strict sequence, always both
  attrs: {
    kind: { default: "info" }, // info | warning | danger
  },
  toDOM(node) {
    return [
      "div",
      {
        class: `callout callout-${node.attrs.kind}`,
        "data-kind": node.attrs.kind,
      },
      0,
    ];
  },
  parseDOM: [
    {
      tag: "div.callout",
      getAttrs: (dom) => ({
        kind: dom.getAttribute("data-kind") || "info",
      }),
    },
  ],
};

const calloutTitleNodeSpec = {
  content: "inline*",
  defining: true, // copy-paste keeps this node intact
  toDOM: () => ["p", { class: "callout-title" }, 0],
  parseDOM: [{ tag: "p.callout-title" }],
};

const calloutBodyNodeSpec = {
  content: "block+", // one or more blocks — allows nested callouts
  toDOM: () => ["div", { class: "callout-body" }, 0],
  parseDOM: [{ tag: "div.callout-body" }],
};

const nodes = {
  doc: docNodeSpec,
  text: textNodeSpec,
  paragraph: paragraphNodeSpec,
  heading: headingNodeSpec,
  bullet_list: bulletListNodeSpec,
  ordered_list: orderedListNodeSpec,
  list_item: listItemNodeSpec,
  card: cardSpec,
  card_body: cardBodySpec,
  card_title: cardTitleSpec,
  callout: calloutNodeSpec,
  callout_title: calloutTitleNodeSpec,
  callout_body: calloutBodyNodeSpec,
};

const marks = {
  link: linkMarkSpec,
  em: emMarkSpec,
};

// const extendedBasicSchema = new Schema({
//   nodes: addListNodes(schema.spec.nodes, "paragraph block*", "block"),
//   marks: schema.spec.marks,
// });

const extendedBasicSchema = new Schema({
  nodes,
  // marks: schema.spec.marks,
  marks,
});

const state = EditorState.create({
  doc: DOMParser.fromSchema(extendedBasicSchema).parse(
    document.querySelector("#content"),
  ),
  plugins: [
    ...exampleSetup({ schema: extendedBasicSchema }),
    keymap({
      "Mod-Shift-c": insertCallout("info"),
    }),
  ],
  // plugins: [],
});

const view = new EditorView(document.querySelector("#editor"), {
  state,
  nodeViews: {
    callout: (node, view, getPos) => new CalloutNodeView(node, view, getPos),
  },

  dispatchTransaction(transaction) {
    transaction.docChanged && updateWordCount(transaction);
    const newState = view.state.apply(transaction);
    view.updateState(newState);
  },
});

document.querySelector("#card").addEventListener("click", () => {
  const tr = view.state.tr;

  const slice = new Slice(
    Fragment.from([
      state.schema.nodes.card.create(
        { kind: "info" },
        Fragment.from([
          state.schema.nodes.card_title.create(
            null,
            state.schema.text("This is my created card title"),
          ),
          state.schema.nodes.card_body.create(
            null,
            state.schema.nodes.paragraph.create(
              null,
              state.schema.text("This is my created card body"),
            ),
          ),
        ]),
      ),
    ]),
    0,
    0,
  );

  const { $cursor } = view.state.selection;

  const insertPos = $cursor.after(1);
  const step = new ReplaceStep(insertPos, insertPos, slice);
  tr.step(step);
  view.dispatch(tr);
});

class CalloutNodeView {
  constructor(node, view, getPos) {
    this.view = view;
    this.getPos = getPos;

    // Outer wrapper
    this.dom = document.createElement("div");
    this.dom.className = `callout callout-${node.attrs.kind}`;

    // Kind selector — sits outside contentDOM, so PM ignores its mutations
    this.kindBtn = document.createElement("button");
    this.kindBtn.className = "callout-kind-btn";
    this.kindBtn.textContent = node.attrs.kind;
    this.kindBtn.addEventListener("mousedown", (e) => {
      e.preventDefault(); // don't steal focus from editor
      this.cycleKind();
    });
    this.dom.appendChild(this.kindBtn);

    // contentDOM is where ProseMirror renders the title + body children
    this.contentDOM = document.createElement("div");
    this.contentDOM.className = "callout-content";
    this.dom.appendChild(this.contentDOM);
  }

  cycleKind() {
    const kinds = ["info", "warning", "danger"];
    const current = this.view.state.doc.nodeAt(this.getPos()).attrs.kind;
    const next = kinds[(kinds.indexOf(current) + 1) % kinds.length];

    const tr = this.view.state.tr.setNodeMarkup(this.getPos(), null, {
      kind: next,
    });
    this.view.dispatch(tr);
  }

  update(node) {
    if (node.type.name !== "callout") return false;
    this.dom.className = `callout callout-${node.attrs.kind}`;
    this.kindBtn.textContent = node.attrs.kind;
    return true;
  }

  // Prevent PM from re-rendering when the button is clicked
  ignoreMutation(mutation) {
    return this.kindBtn.contains(mutation.target);
  }
}

function insertCallout(kind = "info") {
  return (state, dispatch) => {
    const { $from } = state.selection;
    const calloutType = state.schema.nodes.callout;
    const titleType = state.schema.nodes.callout_title;
    const bodyType = state.schema.nodes.callout_body;
    const paragraphType = state.schema.nodes.paragraph;

    // Build: callout > callout_title (empty) + callout_body > paragraph (empty)
    const title = titleType.create();
    const body = bodyType.create(null, paragraphType.create());
    const node = calloutType.create({ kind }, [title, body]);

    const tr = state.tr.replaceSelectionWith(node);

    // Move cursor inside the title
    const titleStart = $from.pos + 1; // +1 for callout open, +1 for title open
    dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(titleStart))));
    return true;
  };
}

function updateWordCount(tr) {
  let wordCount = 0;
  const doc = view.state.doc;
  doc.descendants((node, pos, parent) => {
    if (node.isText) {
      wordCount += node.text.split(" ").filter((word) => word != "").length;
    }
  });
  console.log({ wordCount });
}
