---
"@hyperdx/common-utils": minor
"@hyperdx/app": minor
"@hyperdx/api": minor
---

Add a "Number (Korean)" option to the chart display settings' output format. It
scales a value to the largest applicable Korean myriad unit — 만, 억, 조, 경 —
so 123456789 renders as "1.23억" instead of "123,456,789". Values below 만 are
left as-is, negatives keep their sign, and 경 is the largest unit used. The
decimals slider controls the scaled precision; trailing zeros are dropped.
