import { Plugin } from "postgraphile";

const SmartCommentsPlugin: Plugin = (builder) => {
  builder.hook("build", (build) => {
    const { pgIntrospectionResultsByKind } = build;
    pgIntrospectionResultsByKind.class.forEach((table: Record<string, any>) => {
      if (table.isSelectable && table.namespace && !table.tags.mncud) {
        table.tags.mncud =
          "\n The test table is just for showing this example with comments.";
      }
    });
    return build;
  });
};

export default SmartCommentsPlugin;
