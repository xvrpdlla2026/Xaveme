<?php

namespace App\Support;

class LikePattern
{
    /**
     * Build a LIKE pattern with the wildcards in the user input escaped, so a
     * search for "100%" matches a literal percent sign instead of everything.
     */
    public static function contains(string $value): string
    {
        return '%'.self::escape($value).'%';
    }

    public static function escape(string $value): string
    {
        return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $value);
    }
}
