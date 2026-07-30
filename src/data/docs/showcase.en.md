---
title: showcase
first-drafted: 2026-05-16
slug: showcase
desc: this page showcases how md and code is rendered in my blog
---

An article to showcase how markdown and code is rendered in my blog. It includes code editor frames, terminal frames, line markers, and markdown base elements.

## Frame

### Code editor frames

```js title="my-test-file.js"
console.log("Title attribute example");
```

```html
<!-- src/content/index.html -->
<div>File name comment example</div>
```

### Terminal frames

```bash
echo "This terminal frame has no title"
```

```powershell title="PowerShell terminal example"
Write-Output "This one has a title!"
```

### Overriding frame types

```sh frame="none"
echo "Look ma, no frame!"
```

```powershell frame="code" title="PowerShell Profile.ps1"
# Without overriding, this would be a terminal frame
function Watch-Tail { Get-Content -Tail 20 -Wait $args }
New-Alias tail Watch-Tail
```

## Code

### Marking full lines & line ranges

```js title="line-markers.js" del={2} ins={3-4} {6}
function demo() {
  console.log("this line is marked as deleted");
  // This line and the next one are marked as inserted
  console.log("this is the second inserted line");

  return "this line uses the neutral default marker type";
}
```

### Adding labels to line markers

```jsx {"1":5} del={"2":7-8} ins={"3 long lable":10-13}
// labeled-line-markers.jsx
<button
  role="button"
  {...props}
  value={value}
  className={buttonClassName}
  disabled={disabled}
  active={active}
>
  {children &&
    !active &&
    (typeof children === "string" ? <span>{children}</span> : children)}
</button>
```

### Marking individual text inside lines

```js "given text"
function demo() {
  // Mark any given text inside lines
  return "Multiple matches of the given text are supported";
}
```

Regexp is available

```ts /ye[sp]/
console.log("The words yes and yep will be marked.");
```

Selecting inline marker types (mark, ins, del)

```js "return true;" ins="inserted" del="deleted"
function demo() {
  console.log("These are inserted and deleted marker types");
  // The return statement uses the default marker type
  return true;
}
```

---

## Markdown base

A note for CSAPP [^1]

CppCon is what I'm addicted to [^2] [^3]

_italic_

**bold**

**_italic_bold_**

~~strikethrough~~

> blockquote

> list in blockquote
>
> 1. list item 1
> 2. list item 2
>
> - _italic_, **bold**, **_italic_bold_**, ~~strikethrough~~ in blockquote

1. something I did is already a mistake
2. and I won't do it again
   - You know it as you can't
   - just like someone else does
     1. well, that's fine

- [ ] task1
- [ ] task2
- [x] task3

- [ ] task4

### h3

#### h4

##### h5

###### h6

## table

| a   |   b   |       c |
| :-- | :---: | ------: |
| 1   |   2   |       3 |
| _4_ | **5** | _**6**_ |

[^1]: Computer Sience: A Programmer's Perspective

[^2]: here

[^3]: https://cppcon.org
