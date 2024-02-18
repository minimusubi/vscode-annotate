# Annotate

Parse custom `@annotate` text to colorize any text within a document.

> \> @annotate [\<start_column\> - \<end_column\>] \<text\>

<img src="./images/annotate1.jpg">

The annotations are always contained below the annotated line, but this extension also creates fold regions for all of them.

<img src="./images/annotate2.jpg">

By default, the numbers in brackets describe start/end character columns in VSCode, but with
`@annotate-cfg` directives they can be translated to anything else. In the following example, the numbers map directly to byte offsets in the packet hex dump:

<img src="./images/annotate_cfg1.jpg">

The annotations are given a random color, but it can be also specified manually:

<img src="./images/annotate_cfg2.jpg">

This extension also provides an "Annotate" command to quickly insert an annotation at the selected region: `annotate.annotate`.

# Annotate-cfg

The `@annotate-cfg` directives apply to any subsequent `@annotate`-s. `@annotate-cfg` can be specified multiple times in the same file so the different configurations are used with different annotations.

Currently the following configuration options can be set:

> \> @annotate-cfg [clamp = [\<start_column\>, \<end_column\>]]

- disables annotations before `<start_column>` and after `<end_column>`.

> \> @annotate-cfg [rangeFn = { \<any javascript here to modify `start` and `end` parameters\> }]

- execute any javascript to modify `start` and `end` column numbers in `@annotate`. This effectively allows mapping those values to any other column numbers. Also Note: this runs any user-provided javascript code with `new Function()`.

# Remarks

This extension was developed to simplify reverse-engineering network packet structures while still being able to write regular text remarks with maximum flexibility.