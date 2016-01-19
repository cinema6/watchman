module.exports = {
    options: {
        paths: 'src',
        outdir: 'docs'
    },
    compile: {
        name: '<%= package.name %>',
        description: '<%= package.description %>',
        version: '<%= package.version %>'
    }
};
