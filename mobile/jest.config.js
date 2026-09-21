module.exports = {
  transform: {
    "^.+\\.[jt]sx?$": "babel-jest"
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|uuid|react-native-get-random-values)/)'
  ]
};
