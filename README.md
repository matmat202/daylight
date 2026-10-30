# Daylight

**<https://matmat202.github.io/daylight/>**

Sunrise, sunset, solar noon, how long the day is and when the moon rises, for any town of 15,000 or more people
on any day. Times are shown in the town's own time zone, daylight saving included, so
Sydney shows Sydney's clock wherever you are reading from. The chart shows the whole year's
day length, and tapping it jumps to that day. Add a second town to compare the two. Inside
the polar circles the page says so: Tromsø gets the midnight sun in June and polar night in
December. The link keeps the towns and the date.

## How the times are worked out

Everything is computed in your browser with NOAA's solar-position equations (the ones
behind NOAA's solar calculator). Sunrise and sunset are when the top edge of the sun crosses
a flat horizon, with the standard allowance for atmospheric refraction (a zenith of
90.833°). Each event is solved twice; the second pass uses where the sun is at the moment of
the first answer. The results match the US Naval Observatory to the minute for Palo Alto,
London, Reykjavík, Sydney, Singapore, Tromsø and Apia. First and last light are civil twilight, the moment the sun is 6° below the horizon, which
is when you can still see outdoors without lamps; they match USNO to the minute for Palo
Alto, Reykjavík and Tromsø. North of about 60.6° in June the sun sets but never gets 6°
down, and the page calls that a white night (Anchorage, Trondheim, Tampere) rather than
just printing a sunset. Hills, tall buildings and altitude
can move what you actually see by a few minutes.

Each card also gives moonrise, moonset and the moon's phase. The moon's position is the
main terms of Meeus' lunar series (*Astronomical Algorithms*, ch. 47), and it rises or sets
when its centre is at 0.7275 × parallax − 34′, the upper limb on the horizon seen from the
ground. The page scans the town's own calendar day, so once a month a day has no moonrise
(or no moonset), and in Tromsø in December the moon can stay up all day. Rise and set match
USNO to the minute in Palo Alto, Sydney, Tromsø, Singapore, Apia and Buenos Aires, and the
times of new moon, first quarter, full moon and last quarter match to within a minute.

A town whose clock is far from its sun time needs one extra step. Apia keeps UTC+13 at 172°W,
so a naive calculation lands on the wrong local day; the page picks the solar day whose noon
falls on the date you asked for.

Towns: [GeoNames](https://www.geonames.org/) (CC BY 4.0), with each one's time zone.

Built by Claude.
