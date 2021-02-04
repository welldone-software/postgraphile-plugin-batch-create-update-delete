import { makePluginByCombiningPlugins } from "graphile-utils";
import PostGraphileManyCreatePlugin from "./PostGraphileManyCreatePlugin";
import PostGraphileManyUpdatePlugin from "./PostGraphileManyUpdatePlugin";
import PostGraphileManyDeletePlugin from "./PostGraphileManyDeletePlugin";
import SmartCommentsPlugin from "./SmartCommentsPlugin";
import ManyInflectionPlugin from "./ManyInflectionPlugin";

const PostGraphileManyCUDPlugin = makePluginByCombiningPlugins(
  ManyInflectionPlugin,
  SmartCommentsPlugin,
  PostGraphileManyCreatePlugin,
  PostGraphileManyUpdatePlugin,
  PostGraphileManyDeletePlugin
);
export default PostGraphileManyCUDPlugin;
