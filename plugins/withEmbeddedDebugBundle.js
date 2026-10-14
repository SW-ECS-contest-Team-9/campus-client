// debug APK 에도 JS 묶음을 넣어 Metro 없이 실행(실기기에 그대로 설치). debuggableVariants = [].
const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withEmbeddedDebugBundle(config) {
  return withAppBuildGradle(config, (c) => {
    const s = c.modResults.contents;
    if (!s.includes('debuggableVariants = []')) {
      c.modResults.contents = s.replace(/react \{\n/, 'react {\n    debuggableVariants = []\n');
    }
    return c;
  });
};
