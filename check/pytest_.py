#!/usr/bin/env python3

import sys

import general_superstaq.check

if __name__ == "__main__":
    exit(general_superstaq.check.pytest_.run(*sys.argv[1:]))
