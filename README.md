# ctagz
JS Native ctags parser, based on the [reference implementation](https://github.com/universal-ctags/ctags/blob/master/read/readtags.c) by Darren Hiebert (public domain).

## Usage

```js
const ctagz = require('ctagz')

let ctags
ctagz.findCTagsFile('.')
.then(tags => {
    ctags = tags
    return tags.init()
})
.then(tags => tags.findBinary('tag_name'))
.then(console.log)
.finally(() => ctags.destroy())
```

OR

```js
const ctagz = require('ctagz')

const ctags = ctagz.CTags('/path/to/ctags/file')
ctags.init()
.then(tags => tags.findBinary('tag_name'))
.then(console.log)
.finally(() => ctags.destroy())
```
