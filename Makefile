INCPATHS = ./ ./scr

# Detect OS Environment
UNAME_S := $(shell uname -s)
ifeq ($(UNAME_S),Linux)
	# Linux
endif
ifeq ($(UNAME_S),Darwin)
	# OSX
	INCPATHS += /opt/local/include
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
SRCDIR = ./scr
INCLUDES = $(addprefix -I ,$(INCPATHS))
OBJS = $(SRCDIR)/air.o
OBJS += $(SRCDIR)/main.o
OBJS += $(SRCDIR)/rocket.o
OBJS += $(STCDIR)/coordinate_transform.o
OBJS += $(SRCDIR)/fileio.o
OBJS += $(SRCDIR)/gravity.o
OBJS += $(SRCDIR)/Orbit.o
CC = g++
CFLAGS = -O2 -std=gnu++11
# CFLAGS = -Wall -O2 -std=gnu++11
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
