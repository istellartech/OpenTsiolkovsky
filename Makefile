INCPATHS = ./ ./src

# Detect OS Environment
UNAME_S := $(shell uname -s)
ifeq ($(UNAME_S),Linux)
	# Linux
endif
ifeq ($(UNAME_S),Darwin)
	# OSX
ifneq ($(shell which brew),)
	# Homebrew
	INCPATHS += $(shell brew --prefix boost)/include
else
	INCPATHS += /opt/local/include
endif
endif
ifneq ($(filter MINGW64%, $(UNAME_S)),)
	# MinGW64
	INCPATHS += /mingw64/include
endif
ifneq ($(filter MSYS%, $(UNAME_S)),)
	# MinGW64
	INCPATHS += /mingw64/include
endif

PROGRAM = OpenTsiolkovsky
SRCDIR = ./src
INCLUDES = $(addprefix -I ,$(INCPATHS))
OBJS = $(SRCDIR)/air.o
OBJS += $(SRCDIR)/main.o
OBJS += $(SRCDIR)/rocket.o
OBJS += $(SRCDIR)/fileio.o
OBJS += $(SRCDIR)/gravity.o
OBJS += $(SRCDIR)/Orbit.o
OBJS += $(SRCDIR)/coordinate_transform.o
CC = g++
CFLAGS = -O2 -std=gnu++11 -DEIGEN_MPL2_ONLY
# CFLAGS = -g -Wall -O0 -std=gnu++11 -DEIGEN_MPL2_ONLY
LDLIBS = -lpthread

.SUFFIXES: .c .o
.SUFFIXES: .cpp .o

$(PROGRAM): $(OBJS)
	$(CC) -o $(PROGRAM) $^ $(LDLIBS)
	mv OpenTsiolkovsky bin/

.c.o:
	$(CC) -c $(CFLAGS) $(INCLUDES) $< -o $@

.cpp.o:
	$(CC) -c $(CFLAGS) $(INCLUDES) $< -o $@

.PHONY: clean
clean:
	$(RM) bin/$(PROGRAM) $(OBJS)
