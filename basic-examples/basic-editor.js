import { exampleSetup } from "prosemirror-example-setup";
import { DOMParser, Schema } from "prosemirror-model";
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
  plugins: exampleSetup({ schema: extendedBasicSchema }),
  // plugins: [],
});

const view = new EditorView(document.querySelector("#editor"), {
  state,
});

console.log({ doc: state.doc });
