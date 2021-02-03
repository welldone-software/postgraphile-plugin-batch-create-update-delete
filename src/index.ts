import { makePluginByCombiningPlugins } from "graphile-utils";
import PostGraphileManyCreatePlugin from "./PostGraphileManyCreatePlugin";
import PostGraphileManyUpdatePlugin from "./PostGraphileManyUpdatePlugin";
import PostGraphileManyDeletePlugin from "./PostGraphileManyDeletePlugin";
import SmartCommentsPlugin from "./SmartCommnetsPlugin";

const PostGraphileManyCUDPlugin = makePluginByCombiningPlugins(
  SmartCommentsPlugin,
  PostGraphileManyCreatePlugin,
  PostGraphileManyUpdatePlugin,
  PostGraphileManyDeletePlugin
);
export default PostGraphileManyCUDPlugin;
