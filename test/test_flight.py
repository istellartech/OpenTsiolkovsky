# -*- coding: utf-8 -*-
"""
OpenTsiolkovsky test flight

Copyright (c) 2018 Interstellar Technologies Inc. All Rights Reserved.
Authors : Takahiro Inagawa
"""

import os
import shutil
import subprocess
import json

def run_OpenTsiolkovsky(json_file):
    cmd = './OpenTsiolkovsky ' + json_file
    p = subprocess.Popen([cmd], shell = True, stdout=subprocess.PIPE)
    output = p.communicate()[0]
    outputlist = output.split()
    print(output.decode('utf-8'))
    return True

def run_python_script(script_file, json_file = ""):
    cmd = "python " + script_file + ' ' + json_file
    p = subprocess.Popen([cmd], shell = True, stdout=subprocess.PIPE)
    output = p.communicate()[0]
    print(output.decode('utf-8'))
    return True


if __name__ == '__main__':
    shutil.copy2("../bin/OpenTsiolkovsky", "./OpenTsiolkovsky")

    # test_01 = './test_param_01.json'
    # run_OpenTsiolkovsky(test_01)
    # run_python_script("../bin/make_html.py", test_01)
    # run_python_script("../bin/make_kml.py", test_01)

    test_02 = './test_param_02.json'
    run_OpenTsiolkovsky(test_02)
    assert run_python_script("../bin/make_html.py", test_02)
    assert run_python_script("../bin/make_kml.py", test_02)

    os.remove("./OpenTsiolkovsky")
