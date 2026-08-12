module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
    plugins: [
      // Reanimated deve ser o último plugin.
      "react-native-reanimated/plugin",
    ],
  };
};
