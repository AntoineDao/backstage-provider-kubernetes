module.exports = {
    branches: ['main'],
    plugins: [
        '@semantic-release/commit-analyzer',
        '@semantic-release/release-notes-generator',
        '@semantic-release/github',
        '@semantic-release/npm',
        ['@semantic-release/exec', {
            prepareCmd: 'npm run tsc && npm run build',
        }],
    ],
}
