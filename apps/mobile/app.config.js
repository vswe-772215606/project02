module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    MASTER_URL: process.env.MASTER_URL || config.extra?.MASTER_URL || 'http://192.168.1.50:4000',
  },
});
