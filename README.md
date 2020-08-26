# liverepl
liverepl is a node-repl which will autoreload files when files are modified, inspired by ipython's autoreload feature.

# Installation
using npm:
```shell
npm install -g liverepl
```
And nodemon will be installed globally to your system path.

# Usage
```shell
cd your_node_project
liverepl
liverepl> a = require('./module_a');
liverepl> a.some_method()
liverepl> a.some_method() // rerun directly when you modify some_method code.
liverepl> await a.some_async_or_promise_method();
```

In liverepl, you can require module_a and call it's method. 

When you modify module_a's code and save, you can rerun method without restart livereload.

If module_a.some_method dependent on module_b and you modify module_b's code and save, you can rerun module_a.some_method without restart livereload.

If you want to use 'await' in liverepl, your node version should be above node^10. 

# Config files
you can use config file to init your runtime. create config file in your project dir:
```shell script
touch your_node_project/liverepl.config.js
```
liverepl.config.js example:
```javascript
module.exports = {
    installs: {
        prefix_a_: './a.js',
        prefex_b_: './m'
    },
    constants: {
        constant_name: 'aaaaa',
    },
    ignores: [
        './b'
    ],
};
```
* installs: files or files in some directory will be loaded when start liverepl.  You can use prefix_xxx to refer these modules.
* constants: constants will be added to runtime, constant can be some business ids which you will use often.
* ignores: you can ignore some files to reload when they are modified.



