import React, { useState, useRef, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calculator, TrendingUp, Plus, Trash2, Building2, MapPin, Sun, Moon, Eye, Zap, DollarSign, Wallet, BarChart3, ChevronLeft, ChevronRight, ArrowRight, Copy } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area } from 'recharts';
import { HeroSection } from "@/components/blocks/hero-section-dark";
import { useUser } from "@/components/providers/UserProvider";
import { motion, AnimatePresence, useInView, useMotionValue, useSpring } from "framer-motion";
import { PatrimoineChart } from "@/components/vision/PatrimoineChart";
import { CashflowChart } from "@/components/vision/CashflowChart";
import { ProjectTimeline } from "@/components/vision/ProjectTimeline";
import { ComparatifChart } from "@/components/vision/ComparatifChart";
import { HeroGeometric } from "@/components/ui/hero-geometric";
import { AnimatedText } from "@/components/ui/animated-text";
import AnimatedBackground from "@/components/vision/AnimatedBackground";

import InteractiveFranceMap from "@/components/vision/InteractiveFranceMap";

import { MorphingSquare } from "@/components/ui/morphing-square";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// Hook pour animer les chiffres
function useCountUp(end, isInView, duration = 2.5) {
  const [value, setValue] = useState(0);
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, { duration: duration * 1000, bounce: 0 });

  useEffect(() => {
    if (isInView) {
      motionValue.set(end);
    }
  }, [end, isInView, motionValue]);

  useEffect(() => {
    const unsubscribe = springValue.on("change", (latest) => {
      setValue(Math.round(latest));
    });
    return unsubscribe;
  }, [springValue]);

  return value;
}


// Données des stratégies
const strategiesData = {
  "200": {
    patrimoniale: {
      cashflow: [-1186, -2146, -2901, -2652, -2397, -2137, -1872, -1602, -1326, -9045, -758, -466, -167, 137, 447, 764, 1087, 864, 361, -5923, 15419, 15722, 16031, 16346, 16668, 16995, 17328, 17668, 18013, 18365],
      patrimoine: [-86, 8612, 16894, 25773, 35268, 45396, 56174, 67620, 79753, 84594, 98161, 112475, 127558, 143432, 160118, 177642, 196026, 214743, 233532, 246631, 281688, 303353, 325447, 347977, 370953, 394384, 418281, 442656, 467520, 492884],
      capital_restant: [198900, 192055, 184952, 177582, 169935, 162000, 153766, 145223, 136358, 127159, 117614, 107710, 97433, 86769, 75704, 64223, 52309, 39948, 27120, 13811, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    mixte: {
      cashflow: [1214, -506, -821, -529, -232, 71, 380, 695, 1017, -6655, 1680, 2021, 2369, 1755, 1769, 2018, 2271, 2528, 2789, -3446, 17945, 18298, 18659, 19027, 19402, 19785, 20175, 20573, 20978, 21391],
      patrimoine: [2314, 12652, 23014, 34017, 45677, 58012, 71042, 84786, 99263, 106493, 122498, 139299, 156919, 174410, 192418, 211195, 230763, 251144, 272360, 287937, 325519, 349762, 374483, 399695, 425405, 451625, 478361, 505624, 533421, 561762],
      capital_restant: [198900, 192055, 184952, 177582, 169935, 162000, 153766, 145223, 136358, 127159, 117614, 107710, 97433, 86769, 75704, 64223, 52309, 39948, 27120, 13811, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    agressive: {
      cashflow: [3614, 1134, 1260, 1593, 1933, 2279, 2632, 2993, 2866, -4265, 3257, 3157, 3438, 3722, 4012, 4306, 4605, 4908, 5217, -970, 20471, 20875, 21287, 21708, 22137, 22574, 23019, 23472, 23933, 24403],
      patrimoine: [4714, 16692, 29135, 42260, 56085, 70628, 85911, 101952, 118278, 127898, 145481, 163418, 182106, 201565, 221817, 242882, 264783, 287545, 311189, 329242, 369351, 396170, 423520, 451412, 479856, 508864, 538447, 568618, 599388, 630769],
      capital_restant: [198900, 192055, 184952, 177582, 169935, 162000, 153766, 145223, 136358, 127159, 117614, 107710, 97433, 86769, 75704, 64223, 52309, 39948, 27120, 13811, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    }
  },
  "300": {
    patrimoniale: {
      cashflow: [-1217, -2857, -3890, -3515, -3133, -2744, -2346, -1941, -1527, -9105, -675, -236, 211, 668, 1134, 1609, 941, 608, 928, -5247, 23453, 23908, 24371, 24845, 25327, 25819, 26320, 26831, 27352, 27883],
      patrimoine: [4885, 20726, 36701, 53635, 71555, 90487, 110459, 131500, 153640, 168909, 193338, 218959, 244233, 270463, 297813, 326316, 356003, 386908, 419065, 446010, 502650, 539338, 576746, 614887, 653777, 693433, 733870, 775103, 817148, 860020],
      capital_restant: [297498, 287260, 276637, 265613, 254175, 242306, 229991, 217212, 203952, 190194, 175917, 161103, 145732, 129782, 113232, 96059, 78240, 59750, 40565, 20657, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    mixte: {
      cashflow: [2383, -397, -769, -332, 114, 569, 1032, 1505, 1988, -5520, 2982, 3494, 2442, 2670, 3039, 3413, 3793, 4178, 4570, -1532, 27242, 27773, 28314, 28866, 29429, 30003, 30587, 31183, 31790, 32408],
      patrimoine: [8485, 26786, 45882, 66000, 87167, 109411, 132762, 157249, 181302, 199891, 226046, 253295, 281668, 311196, 341912, 373846, 407034, 441510, 477309, 507968, 568397, 608951, 650301, 692463, 735455, 779293, 823993, 869572, 916048, 963438],
      capital_restant: [297498, 287260, 276637, 265613, 254175, 242306, 229991, 217212, 203952, 190194, 175917, 161103, 145732, 129782, 113232, 96059, 78240, 59750, 40565, 20657, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    agressive: {
      cashflow: [5983, 2063, 2353, 2852, 3361, 3881, 4411, 4951, 3901, -2200, 4707, 5121, 5542, 5969, 6403, 6845, 7293, 7749, 8212, 2182, 31031, 31638, 32256, 32887, 33530, 34185, 34853, 35534, 36228, 36935],
      patrimoine: [12252, 36876, 62625, 89736, 118245, 148190, 179609, 212022, 244322, 268255, 303357, 339917, 377975, 417573, 458752, 501556, 546030, 592220, 640173, 680190, 760939, 815227, 870577, 927010, 984549, 1043213, 1103018, 1163986, 1226138, 1289497],
      capital_restant: [297498, 287260, 276637, 265613, 254175, 242306, 229991, 217212, 203952, 190194, 175917, 161103, 145732, 129782, 113232, 96059, 78240, 59750, 40565, 20657, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    }
  },
  "400": {
    patrimoniale: {
      cashflow: [-1279, -4279, -5867, -5242, -4606, -3956, -3294, -2618, -1929, -13226, -509, 223, 969, 1730, 2506, 2262, 1002, 1528, 2062, -7146, 39522, 40279, 41052, 41841, 42645, 43466, 44303, 45157, 46027, 46914],
      patrimoine: [7452, 28796, 50384, 73250, 97429, 122957, 149871, 178210, 208013, 227320, 260173, 294316, 328062, 363262, 399954, 438182, 477989, 519418, 562516, 597579, 673276, 722410, 772504, 823576, 875646, 928733, 982858, 1038039, 1094298, 1151655],
      capital_restant: [396100, 382468, 368324, 353647, 338418, 322615, 306218, 289204, 271550, 253231, 234222, 214499, 194033, 172797, 150761, 127897, 104172, 79554, 54009, 27503, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    mixte: {
      cashflow: [3552, -288, -717, -134, 460, 1066, 1685, 2315, 2959, -8385, 4284, 4667, 3333, 3817, 4309, 4808, 5314, 5829, 6351, -2869, 36540, 37247, 37968, 38704, 39455, 40221, 41002, 41799, 42611, 43440],
      patrimoine: [12252, 36876, 62625, 89736, 118245, 148190, 179609, 212022, 244322, 268255, 303357, 339917, 377975, 417573, 458752, 501556, 546030, 592220, 640173, 680190, 760939, 815227, 870577, 927010, 984549, 1043213, 1103018, 1163986, 1226138, 1289497],
      capital_restant: [396100, 382468, 368324, 353647, 338418, 322615, 306218, 289204, 271550, 253231, 234222, 214499, 194033, 172797, 150761, 127897, 104172, 79554, 54009, 27503, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    agressive: {
      cashflow: [8352, 2992, 3445, 4111, 4790, 5483, 6189, 6390, 5456, -3760, 6533, 7085, 7646, 8216, 8795, 9384, 9982, 10590, 11207, 2085, 41592, 42400, 43225, 44066, 44923, 45797, 46688, 47596, 48522, 49466],
      patrimoine: [16652, 51476, 87750, 125735, 165487, 207065, 250532, 295952, 343389, 379851, 437255, 496539, 557769, 621010, 686331, 753799, 823484, 895458, 969793, 1034773, 1157939, 1233227, 1310577, 1390010, 1471549, 1555213, 1641018, 1728986, 1819138, 1911497],
      capital_restant: [396100, 382468, 368324, 353647, 338418, 322615, 306218, 289204, 271550, 253231, 234222, 214499, 194033, 172797, 150761, 127897, 104172, 79554, 54009, 27503, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    }
  },
  "500": {
    patrimoniale: {
      cashflow: [-1279, -4279, -5867, -5242, -4606, -3956, -3294, -2618, -1929, -13226, -509, 223, 969, 1730, 2506, 2262, 1002, 1528, 2062, -7146, 39522, 40279, 41052, 41841, 42645, 43466, 44303, 45157, 46027, 46914],
      patrimoine: [10021, 36867, 64068, 92866, 123305, 155429, 189286, 224922, 262388, 289733, 331010, 372790, 415143, 459312, 505348, 553301, 603227, 655180, 709218, 755650, 850404, 911985, 974764, 1038767, 1104017, 1170539, 1238357, 1307497, 1377982, 1449837],
      capital_restant: [494700, 477675, 460010, 441679, 422659, 402923, 382444, 361195, 339146, 316267, 292527, 267893, 242333, 215810, 188290, 159734, 130103, 99357, 67453, 34350, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    mixte: {
      cashflow: [4721, -179, -665, 64, 806, 1564, 2337, 3125, 3929, -7250, 5586, 4956, 4359, 4964, 5579, 6203, 6836, 7479, 8132, -955, 45837, 46721, 47623, 48543, 49481, 50437, 51411, 52404, 53416, 54448],
      patrimoine: [16021, 46967, 79370, 113474, 149325, 186970, 226457, 266797, 307345, 339870, 383919, 429791, 477535, 527202, 578845, 632518, 688278, 746182, 806290, 858913, 959910, 1027739, 1096775, 1167042, 1238564, 1311366, 1385473, 1460909, 1537699, 1615868],
      capital_restant: [494700, 477675, 460010, 441679, 422659, 402923, 382444, 361195, 339146, 316267, 292527, 267893, 242333, 215810, 188290, 159734, 130103, 99357, 67453, 34350, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    agressive: {
      cashflow: [10721, 3921, 4537, 5370, 6219, 7085, 7968, 7828, 7012, -2070, 8358, 9048, 9749, 10462, 11186, 11922, 12670, 13430, 14202, 5237, 52078, 52970, 53879, 54807, 55753, 56718, 57702, 58706, 59730, 60775],
      patrimoine: [22421, 59367, 98370, 139695, 183405, 229566, 278245, 329509, 383426, 426370, 486119, 548791, 614453, 683173, 755021, 830067, 908383, 990041, 1075115, 1151913, 1285910, 1377739, 1471775, 1568042, 1666564, 1767366, 1870473, 1975909, 2083699, 2193868],
      capital_restant: [494700, 477675, 460010, 441679, 422659, 402923, 382444, 361195, 339146, 316267, 292527, 267893, 242333, 215810, 188290, 159734, 130103, 99357, 67453, 34350, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    }
  },
  "700": {
    patrimoniale: {
      cashflow: [-1340, -5700, -7844, -6970, -6078, -5169, -4241, -3296, -2331, -17346, -343, 681, 1726, 2791, 3878, 2266, 1711, 2449, 3197, -9045, 55590, 56651, 57718, 58692, 59686, 60694, 61722, 62770, 63838, 64927],
      patrimoine: [15160, 53011, 91438, 132099, 175057, 220374, 268115, 318347, 371138, 410559, 468685, 526487, 586056, 648164, 712884, 780289, 850453, 923454, 999124, 1065042, 1197108, 1282632, 1369687, 1458301, 1548508, 1640341, 1733833, 1829016, 1925925, 2024591],
      capital_restant: [691900, 668089, 643381, 617744, 591142, 563538, 534896, 505176, 474338, 442339, 409135, 374682, 338933, 301838, 263347, 223408, 181965, 138963, 94342, 48042, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    mixte: {
      cashflow: [7060, 40, -561, 459, 1499, 2560, 3642, 4745, 5871, -8981, 8190, 6284, 6411, 7258, 8119, 8992, 9879, 10780, 11445, -377, 63629, 64721, 65835, 66971, 68130, 69312, 70518, 71748, 73002, 74281],
      patrimoine: [23560, 67151, 112860, 160951, 211486, 264531, 320155, 376345, 433389, 479851, 541795, 606289, 673403, 743209, 815776, 890886, 968610, 1049019, 1132186, 1206773, 1346640, 1440121, 1535292, 1632185, 1730836, 1831277, 1933543, 2037668, 2143686, 2251634],
      capital_restant: [691900, 668089, 643381, 617744, 591142, 563538, 534896, 505176, 474338, 442339, 409135, 374682, 338933, 301838, 263347, 223408, 181965, 138963, 94342, 48042, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    agressive: {
      cashflow: [15460, 5780, 6722, 7887, 9076, 10288, 11525, 10703, 10124, -1941, 12009, 12975, 13957, 14955, 15966, 16698, 17439, 18187, 18944, 8291, 71430, 72678, 73951, 75250, 76574, 77924, 79301, 80705, 82136, 83595],
      patrimoine: [23560, 67151, 112860, 160951, 211486, 264531, 320155, 376345, 433389, 479851, 541795, 606289, 673403, 743209, 815776, 890886, 968610, 1049019, 1132186, 1206773, 1346640, 1440121, 1535292, 1632185, 1730836, 1831277, 1933543, 2037668, 2143686, 2251634],
      capital_restant: [691900, 668089, 643381, 617744, 591142, 563538, 534896, 505176, 474338, 442339, 409135, 374682, 338933, 301838, 263347, 223408, 181965, 138963, 94342, 48042, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    }
  },
  "1000": {
    patrimoniale: {
      cashflow: [-1433, -7833, -10809, -9560, -8287, -6988, -5663, -4312, -2933, -17527, -93, 1370, 2862, 4384, 5346, 1737, 2776, 3445, 4106, -7018, 78168, 79505, 80869, 82260, 83680, 85128, 86605, 88112, 89648, 91215],
      patrimoine: [10867, 57026, 101887, 149733, 200645, 254710, 312016, 372654, 436717, 488302, 559509, 634441, 713203, 795906, 882070, 967211, 1056064, 1148351, 1244159, 1331800, 1507685, 1616909, 1728091, 1841271, 1956489, 2073786, 2193204, 2314785, 2438571, 2564606],
      capital_restant: [987700, 953709, 918438, 881841, 843866, 804461, 763574, 721148, 677126, 631447, 584048, 534866, 483833, 430879, 375933, 318918, 259758, 198372, 134675, 68581, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    mixte: {
      cashflow: [10567, 367, -405, 1052, 2538, 4053, 5599, 7175, 8783, -1576, 10200, 8298, 9489, 10536, 11377, 12226, 13083, 13947, 14818, 7445, 89312, 90872, 92464, 94087, 95743, 97431, 99152, 100907, 102696, 104520],
      patrimoine: [22867, 77226, 132491, 190949, 252686, 317792, 386359, 458483, 534263, 601799, 683300, 765159, 850549, 939403, 1031599, 1127229, 1226389, 1329178, 1435697, 1537802, 1724831, 1845423, 1968200, 2093207, 2220488, 2350085, 2482043, 2616408, 2753226, 2892544],
      capital_restant: [987700, 953709, 918438, 881841, 843866, 804461, 763574, 721148, 677126, 631447, 584048, 534866, 483833, 430879, 375933, 318918, 259758, 198372, 134675, 68581, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    agressive: {
      cashflow: [22567, 8567, 9999, 11664, 13362, 15094, 16860, 15017, 14793, 3128, 17202, 18202, 19214, 20238, 21273, 22320, 23379, 24448, 25529, 15622, 100457, 102240, 104059, 105914, 107806, 109736, 111705, 113713, 115761, 117850],
      patrimoine: [34867, 97426, 163095, 232165, 304726, 380873, 460702, 540667, 622456, 694697, 783200, 874964, 970079, 1068635, 1170727, 1276452, 1385908, 1499198, 1616429, 1726710, 1924884, 2056843, 2191215, 2328048, 2467393, 2609300, 2753818, 2901000, 3050898, 3203569],
      capital_restant: [987700, 953709, 918438, 881841, 843866, 804461, 763574, 721148, 677126, 631447, 584048, 534866, 483833, 430879, 375933, 318918, 259758, 198372, 134675, 68581, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    }
  },
  "1200": {
    patrimoniale: {
      cashflow: [-1494, -9254, -12786, -11287, -9759, -8201, -6611, -4989, -3335, -17648, 73, 1829, 3619, 5445, 5470, 1843, 2628, 3418, 4212, -5992, 93061, 94666, 96303, 97973, 99676, 101413, 103184, 104989, 106829, 108705],
      patrimoine: [13606, 69129, 123136, 180723, 241990, 307039, 375977, 448912, 525958, 591229, 676846, 766933, 861615, 961024, 1063458, 1165366, 1271267, 1381274, 1495506, 1603082, 1813380, 1943709, 2076388, 2211464, 2348985, 2488999, 2631553, 2776694, 2924470, 3074930],
      capital_restant: [1184900, 1144122, 1101810, 1057905, 1012348, 965077, 916026, 865130, 812318, 757518, 700657, 641655, 580433, 516907, 450990, 382592, 311621, 237978, 161564, 82274, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    mixte: {
      cashflow: [12906, 586, -301, 1447, 3230, 5048, 6903, 8795, 10725, -3307, 12319, 9936, 10926, 11927, 12936, 13955, 14984, 16020, 17066, 7119, 106435, 108307, 110217, 112165, 114152, 116178, 118244, 120351, 122499, 124689],
      patrimoine: [28006, 93369, 159861, 230182, 304438, 382736, 465188, 551908, 643013, 722626, 820488, 918682, 1020671, 1126562, 1236462, 1350482, 1468738, 1591348, 1718434, 1839121, 2062793, 2206763, 2353355, 2502624, 2654621, 2809400, 2967015, 3127521, 3290975, 3457434],
      capital_restant: [1184900, 1144122, 1101810, 1057905, 1012348, 965077, 916026, 865130, 812318, 757518, 700657, 641655, 580433, 516907, 450990, 382592, 311621, 237978, 161564, 82274, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    agressive: {
      cashflow: [27306, 10426, 12184, 14182, 16219, 18297, 20417, 17892, 17568, 6508, 19926, 21126, 22341, 23569, 24812, 26068, 27339, 28623, 29920, 20231, 119808, 121948, 124131, 126357, 128627, 130942, 133302, 135709, 138163, 140665],
      patrimoine: [42406, 117609, 196585, 279641, 366886, 458434, 554399, 650216, 748164, 837591, 943061, 1052445, 1165849, 1283382, 1405157, 1531290, 1661902, 1797114, 1937053, 2070852, 2307897, 2465508, 2626015, 2789475, 2955948, 3125491, 3298160, 3474018, 3653126, 3835548],
      capital_restant: [1184900, 1144122, 1101810, 1057905, 1012348, 965077, 916026, 865130, 812318, 757518, 700657, 641655, 580433, 516907, 450990, 382592, 311621, 237978, 161564, 82274, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    }
  }
};

const apportData = {
  "200": 35100,
  "300": 52500,
  "400": 69900,
  "500": 87300,
  "700": 122100,
  "1000": 174300,
  "1200": 209100
};

// Composant pour les cards avec animation de chiffres
function AnimatedStatCard({ icon: Icon, title, value, suffix, description, delay = 0 }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const animatedValue = useCountUp(value, isInView, 2);

  const formatValue = (val) => {
    if (val >= 1000000) {
      return `${(val / 1000000).toFixed(1)}M`;
    }
    if (val >= 1000) {
      return `${Math.round(val / 1000)}K`;
    }
    return val.toLocaleString('fr-FR');
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ delay, duration: 0.5 }}
      className="border-t border-[#edeae5]/[0.35] pt-6 pb-2">

      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-[#35a79b]" />
        <span className="text-[10px] tracking-[0.2em] uppercase text-[#8b9391]">{title}</span>
      </div>
      <div className="text-[36px] max-md:text-[28px] font-light text-[#edeae5] leading-none mb-2" style={{ fontVariantNumeric: "tabular-nums" }}>
        {formatValue(animatedValue)} {suffix}
      </div>
      <p className="text-[13px] text-[#8b9391] leading-[1.6] mb-0">{description}</p>
    </motion.div>);

}

export default function Vision() {
  const user = useUser();
  const [typeStrategie, setTypeStrategie] = useState("mixte");
  const [nombreProjets, setNombreProjets] = useState(3);
  const [projets, setProjets] = useState([{ taille: "300" }, { taille: "400" }, { taille: "500" }]);
  const [frequence, setFrequence] = useState(2);
  const [objectif, setObjectif] = useState("patrimoine");
  const [age, setAge] = useState("35");
  const [typeInvestissement, setTypeInvestissement] = useState("seule");
  const [resultat, setResultat] = useState(null);
  const [expandedYears, setExpandedYears] = useState([]);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [revenusMensuels, setRevenusMensuels] = useState("");
  const [currentSlide, setCurrentSlide] = useState(0);
  const [currentProjIndex, setCurrentProjIndex] = useState(0);

  // Récupérer les projets de l'utilisateur
  const { data: userProjects = [] } = useQuery({
    queryKey: ['user-projects-vision', user?.email],
    queryFn: async () => {
      if (!user) return [];
      const emailToCheck = user.est_compte_shadow && user.compte_maitre_email ?
      user.compte_maitre_email :
      user.email;

      const allProjects = await base44.entities.Project.list();
      return allProjects.filter((p) =>
      p.client_email === emailToCheck ||
      p.client_emails && p.client_emails.includes(emailToCheck)
      );
    },
    enabled: !!user,
    initialData: []
  });

  const statsRef = useRef(null);
  const cardsRef = useRef(null);
  const chartsRef = useRef(null);
  const tableRef = useRef(null);
  const formRef = useRef(null);
  const resultsContainerRef = useRef(null);

  const statsInView = useInView(statsRef, { once: true, margin: "-100px" });
  const cardsInView = useInView(cardsRef, { once: true, margin: "-100px" });
  const chartsInView = useInView(chartsRef, { once: true, margin: "-100px" });
  const tableInView = useInView(tableRef, { once: true, margin: "-100px" });
  const formInView = useInView(formRef, { once: true, margin: "-100px" });

  const toggleYearExpansion = (annee) => {
    setExpandedYears((prev) =>
    prev.includes(annee) ? prev.filter((a) => a !== annee) : [...prev, annee]
    );
  };

  const calculerStrategie = () => {
    try {
      setHasError(false);
      setIsLoading(true);
      
      setTimeout(() => {
        const strategieKey = typeStrategie === "patrimoniale" ? "patrimoniale" :
        typeStrategie === "agressive" ? "agressive" : "mixte";

        // Initialiser les tableaux cumulés sur 30 ans
        const cashflowCumule = new Array(30).fill(0);
        const patrimoineCumule = new Array(30).fill(0);
        const capitalRestantCumule = new Array(30).fill(0);
        const apportTotal = projets.reduce((sum, p) => sum + apportData[p.taille], 0);

        // Stocker les détails par projet pour chaque année
        const detailsProjetsParAnnee = new Array(30).fill(null).map(() => []);

        // Superposer chaque projet
        projets.forEach((projet, index) => {
          const anneeDebut = index * frequence;
          const tailleProjet = projet.taille;
          const donneesProjet = strategiesData[tailleProjet][strategieKey];

          // Ajouter les données du projet à partir de son année de début
          donneesProjet.cashflow.forEach((cf, yearIndex) => {
            const anneeGlobale = anneeDebut + yearIndex;
            if (anneeGlobale < 30) {
              cashflowCumule[anneeGlobale] += cf;

              // Stocker les détails pour cette année
              detailsProjetsParAnnee[anneeGlobale].push({
                projetIndex: index + 1,
                taille: tailleProjet,
                cashflow: cf,
                patrimoine: donneesProjet.patrimoine[yearIndex],
                capitalRestant: donneesProjet.capital_restant[yearIndex]
              });
            }
          });

          donneesProjet.patrimoine.forEach((pat, yearIndex) => {
            const anneeGlobale = anneeDebut + yearIndex;
            if (anneeGlobale < 30) {
              patrimoineCumule[anneeGlobale] += pat;
            }
          });

          donneesProjet.capital_restant.forEach((cap, yearIndex) => {
            const anneeGlobale = anneeDebut + yearIndex;
            if (anneeGlobale < 30) {
              capitalRestantCumule[anneeGlobale] += cap;
            }
          });
        });

        // Préparer les données pour le graphique
        const chartData = [];
        for (let i = 0; i < 30; i++) {
          chartData.push({
            annee: i + 1,
            patrimoine: Math.round(patrimoineCumule[i]),
            cashflow: Math.round(cashflowCumule[i]),
            capitalRestant: Math.round(capitalRestantCumule[i]),
            detailsProjets: detailsProjetsParAnnee[i]
          });
        }

        setResultat({
          chartData,
          patrimoine20: patrimoineCumule[19],
          patrimoine25: patrimoineCumule[24],
          patrimoine30: patrimoineCumule[29],
          cashflow20: cashflowCumule[19],
          cashflow25: cashflowCumule[24],
          cashflow30: cashflowCumule[29],
          apportTotal
        });

        setIsLoading(false);
        setTimeout(() => {
          if (resultsContainerRef.current) {
            window.scrollTo({ top: resultsContainerRef.current.offsetTop - 100, behavior: 'smooth' });
          }
        }, 100);
      }, 800);
    } catch (error) {
      console.error("Erreur lors du calcul de la stratégie:", error);
      setHasError(true);
      setIsLoading(false);
    }
  };

  const ajouterProjet = () => {
    setProjets([...projets, { taille: "200" }]);
    setNombreProjets(nombreProjets + 1);
  };

  const supprimerProjet = (index) => {
    const nouveauxProjets = projets.filter((_, i) => i !== index);
    setProjets(nouveauxProjets);
    setNombreProjets(nombreProjets - 1);
  };

  const modifierTailleProjet = (index, nouvelleTaille) => {
    const nouveauxProjets = [...projets];
    nouveauxProjets[index].taille = nouvelleTaille;
    setProjets(nouveauxProjets);
  };

  const dupliquerProjet = (index) => {
    const projetADupliquer = projets[index];
    const nouveauxProjets = [...projets];
    nouveauxProjets.splice(index + 1, 0, { ...projetADupliquer });
    setProjets(nouveauxProjets);
    setNombreProjets(nombreProjets + 1);
  };

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0c0c] text-[#edeae5]">
        <div className="text-center">
          <h2 className="text-2xl mb-4">Une erreur est survenue</h2>
          <Button onClick={() => setHasError(false)}>Réessayer</Button>
        </div>
      </div>);

  }

  const getStrategyColor = () => {
    switch (typeStrategie) {
      case "agressive":return "#ef4444";
      case "patrimoniale":return "#35a79b";
      case "mixte":return "#ffffff";
      default:return "#ffffff";
    }
  };

  const strategyColor = getStrategyColor();

  const getLightColor = () => {
    switch (typeStrategie) {
      case "agressive":return "rgba(239, 68, 68, 0.25)";
      case "patrimoniale":return "rgba(16, 185, 129, 0.25)";
      case "mixte":return "rgba(200, 200, 200, 0.2)";
      default:return "rgba(16, 185, 129, 0.25)";
    }
  };

  const getBorderColor = () => {
    switch (typeStrategie) {
      case "agressive":return "#ef4444";
      case "patrimoniale":return "#35a79b";
      case "mixte":return "#ffffff";
      default:return "#ffffff";
    }
  };

  const borderColor = getBorderColor();

  const getDescriptionText = () => {
    const texts = {
      seule: {
        retraite: "Notre simulateur vous aide à construire un patrimoine solide pour votre retraite. Visualisez vos revenus passifs et planifiez votre liberté financière.",
        patrimoine: "Développez votre patrimoine personnel avec une stratégie sur mesure. Analysez vos investissements et maximisez votre création de richesse.",
        diversification: "Diversifiez intelligemment vos actifs pour sécuriser votre avenir. Explorez différentes stratégies et optimisez votre portefeuille immobilier."
      },
      couple: {
        retraite: "Construisez ensemble un patrimoine pour une retraite sereine. Notre simulateur projette vos revenus communs et vous aide à planifier votre avenir à deux.",
        patrimoine: "Développez votre patrimoine familial avec une vision partagée. Analysez vos investissements en couple et bâtissez votre héritage.",
        diversification: "Diversifiez vos investissements en couple pour sécuriser votre famille. Explorez des stratégies adaptées à vos objectifs communs."
      },
      famille: {
        retraite: "Préparez l'avenir de votre famille avec une stratégie patrimoniale solide. Visualisez la transmission de patrimoine et les revenus pour plusieurs générations.",
        patrimoine: "Construisez un patrimoine familial durable pour les générations futures. Notre simulateur vous aide à optimiser votre stratégie de transmission.",
        diversification: "Diversifiez le patrimoine familial pour protéger et faire croître vos actifs. Analysez l'impact de chaque investissement sur l'ensemble de la famille."
      }
    };
    return texts[typeInvestissement]?.[objectif] || "Notre simulateur analyse vos investissements, projette vos cashflows et vous aide à construire la stratégie qui correspond à vos objectifs financiers.";
  };

  return (
    <div
      className="min-h-screen bg-[#0a0c0c] text-[#edeae5]">

      {/* Écran de chargement */}
      <AnimatePresence>
        {isLoading &&
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0a0c0c]/95 backdrop-blur-3xl">

              <div className="flex flex-col items-center gap-5">
                <span className="text-[15px] tracking-[0.36em] text-[#edeae5] select-none">KLOCKA</span>
                <div className="w-6 h-6 border-2 border-[#35a79b]/30 border-t-[#35a79b] rounded-full animate-spin" />
                <span className="text-[10px] tracking-[0.2em] uppercase text-[#8b9391]">Calcul de votre projection</span>
              </div>
          </motion.div>
        }
      </AnimatePresence>



      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-12">

        {/* Onglets de navigation */}
        {resultat &&
        <Tabs value={`tab-${currentSlide}`} onValueChange={(val) => setCurrentSlide(parseInt(val.split('-')[1]))} className="w-full mb-8 mt-4">
            <TabsList className="w-full flex justify-center gap-4 max-md:gap-2 bg-transparent border-b border-[#171918] mb-6 max-md:mb-4 rounded-none px-0 h-auto pb-0 overflow-x-auto max-md:overflow-x-scroll scrollbar-hide">
              <TabsTrigger
              value="tab-0"
              className="relative text-[11px] max-md:text-[10.5px] tracking-[0.16em] uppercase bg-transparent border-0 text-[#8b9391] hover:text-[#edeae5] data-[state=active]:bg-transparent data-[state=active]:text-[#edeae5] data-[state=active]:shadow-none transition-all duration-300 pb-3 max-md:text-xs max-md:pb-2 after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#35a79b] after:scale-x-0 data-[state=active]:after:scale-x-100 after:transition-transform after:duration-300 after:origin-center">

                Vue d'ensemble
              </TabsTrigger>
              <TabsTrigger
              value="tab-1"
              className="relative text-[11px] max-md:text-[10.5px] tracking-[0.16em] uppercase bg-transparent border-0 text-[#8b9391] hover:text-[#edeae5] data-[state=active]:bg-transparent data-[state=active]:text-[#edeae5] data-[state=active]:shadow-none transition-all duration-300 pb-3 max-md:text-xs max-md:pb-2 after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#35a79b] after:scale-x-0 data-[state=active]:after:scale-x-100 after:transition-transform after:duration-300 after:origin-center">

                Timeline
              </TabsTrigger>
              <TabsTrigger
              value="tab-2"
              className="relative text-[11px] max-md:text-[10.5px] tracking-[0.16em] uppercase bg-transparent border-0 text-[#8b9391] hover:text-[#edeae5] data-[state=active]:bg-transparent data-[state=active]:text-[#edeae5] data-[state=active]:shadow-none transition-all duration-300 pb-3 max-md:text-xs max-md:pb-2 after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#35a79b] after:scale-x-0 data-[state=active]:after:scale-x-100 after:transition-transform after:duration-300 after:origin-center">

                Evolution
              </TabsTrigger>
              <TabsTrigger
              value="tab-3"
              className="relative text-[11px] max-md:text-[10.5px] tracking-[0.16em] uppercase bg-transparent border-0 text-[#8b9391] hover:text-[#edeae5] data-[state=active]:bg-transparent data-[state=active]:text-[#edeae5] data-[state=active]:shadow-none transition-all duration-300 pb-3 max-md:text-xs max-md:pb-2 after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#35a79b] after:scale-x-0 data-[state=active]:after:scale-x-100 after:transition-transform after:duration-300 after:origin-center">

                Projets
              </TabsTrigger>
              <TabsTrigger
              value="tab-4"
              className="relative text-[11px] max-md:text-[10.5px] tracking-[0.16em] uppercase bg-transparent border-0 text-[#8b9391] hover:text-[#edeae5] data-[state=active]:bg-transparent data-[state=active]:text-[#edeae5] data-[state=active]:shadow-none transition-all duration-300 pb-3 max-md:text-xs max-md:pb-2 after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#35a79b] after:scale-x-0 data-[state=active]:after:scale-x-100 after:transition-transform after:duration-300 after:origin-center">

                Comparatif
              </TabsTrigger>
              <TabsTrigger
              value="tab-5"
              className="relative text-[11px] max-md:text-[10.5px] tracking-[0.16em] uppercase bg-transparent border-0 text-[#8b9391] hover:text-[#edeae5] data-[state=active]:bg-transparent data-[state=active]:text-[#edeae5] data-[state=active]:shadow-none transition-all duration-300 pb-3 max-md:text-xs max-md:pb-2 after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#35a79b] after:scale-x-0 data-[state=active]:after:scale-x-100 after:transition-transform after:duration-300 after:origin-center">

                Chiffres détaillés
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }

        {/* Section Résultats - Diaporama */}
        <AnimatePresence mode="wait">
          {resultat &&
          <div ref={resultsContainerRef} className="relative min-h-screen flex flex-col">
              {/* Éléments de background colorés pour les résultats */}

              {/* Header avec navigation */}
              <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mb-6">

                <div className="flex items-center justify-between gap-6">
                  {/* Titre de la page */}
                  <div>
                    {currentSlide === 1 &&
                  <h2 className="text-[30px] md:text-[38px] font-light tracking-[-0.02em] leading-[1.12]">
                        <span className="text-[#edeae5]">Visualisez l'échelonnement</span><br />
                        <span className="text-[#7fd3c9] font-light">de vos acquisitions</span>
                      </h2>
                  }
                    {currentSlide === 2 &&
                  <h2 className="text-[30px] md:text-[38px] font-light tracking-[-0.02em] leading-[1.12]">
                        <span className="text-[#edeae5]">Voyons maintenant comment</span><br />
                        <span className="text-[#7fd3c9] font-light">votre patrimoine évolue</span>
                      </h2>
                  }
                    {currentSlide === 3 &&
                  <h2 className="text-[30px] md:text-[38px] font-light tracking-[-0.02em] leading-[1.12]">
                        <span className="text-[#edeae5]">Découvrez où se situent</span><br />
                        <span className="text-[#7fd3c9] font-light">vos futurs investissements</span>
                      </h2>
                  }
                    {currentSlide === 4 &&
                  <h2 className="text-[30px] md:text-[38px] font-light tracking-[-0.02em] leading-[1.12]">
                        <span className="text-[#edeae5]">Observez la transformation</span><br />
                        <span className="text-[#e0c9a0] font-light">de votre investissement</span>
                      </h2>
                  }
                    {currentSlide === 5 &&
                  <h2 className="text-[30px] md:text-[38px] font-light tracking-[-0.02em] leading-[1.12]">
                        <span className="text-[#edeae5]">Pour finir, explorez</span><br />
                        <span className="text-[#7fd3c9] font-light">le détail année par année</span>
                      </h2>
                  }
                  </div>

                  {/* Navigation */}
                  <div className="flex items-center gap-3">
                    <Button
                    onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
                    disabled={currentSlide === 0}
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 bg-[#0a0c0c]/50 border-[#282b2a] text-[#edeae5] hover:bg-[#0a0c0c] disabled:opacity-30">

                      <ChevronLeft className="w-5 h-5" />
                    </Button>
                    <Button
                    onClick={() => setCurrentSlide(Math.min(5, currentSlide + 1))}
                    disabled={currentSlide === 5}
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 bg-[#0a0c0c]/50 border-[#282b2a] text-[#edeae5] hover:bg-[#0a0c0c] disabled:opacity-30">

                      <ChevronRight className="w-5 h-5" />
                    </Button>
                    <div className="text-sm text-[#9aa19e] font-normal">
                      {currentSlide + 1} / 6
                    </div>
                    <Button
                    onClick={() => {setResultat(null);setCurrentSlide(0);}}
                    className="bg-[#e0c9a0] hover:bg-[#e5a968] text-black font-medium">

                      Recommencer
                    </Button>
                  </div>
                </div>
              </motion.div>

              {/* Slides */}
              <div className="flex-1 relative">
                <AnimatePresence mode="wait">
                  {/* Slide 1 - Vue macro */}
                  {currentSlide === 0 &&
                <motion.div
                  key="slide-0"
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  transition={{ duration: 0.4 }}
                  className="space-y-12">

                      {/* Titre slide */}
                      <div className="text-center">
                        <h2 className="text-[38px] md:text-[50px] font-light tracking-[-0.02em] leading-[1.08] mb-4">
                          <span className="text-[#edeae5]">Vue d'ensemble</span><br />
                          <span className="text-[#35a79b] font-light">Votre stratégie en chiffres</span>
                        </h2>
                      </div>

                      {/* Stats clés uniquement */}
                      <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                        <AnimatedStatCard
                      icon={Wallet}
                      title="Investissement initial"
                      value={resultat.apportTotal}
                      suffix="€"
                      description={`Acquis sur ${projets.length * frequence} ans • ${projets.length} projet${projets.length > 1 ? 's' : ''} espacé${projets.length > 1 ? 's' : ''} de ${frequence} an${frequence > 1 ? 's' : ''}`}
                      delay={0.1} />

                        <AnimatedStatCard
                      icon={TrendingUp}
                      title="Patrimoine à 20 ans"
                      value={resultat.patrimoine20}
                      suffix="€"
                      description="Étape clé de votre stratégie"
                      delay={0.2} />

                        <AnimatedStatCard
                      icon={TrendingUp}
                      title="Patrimoine à 30 ans"
                      value={resultat.patrimoine30}
                      suffix="€"
                      description={`Soit un multiple de ${(resultat.patrimoine30 / resultat.apportTotal).toFixed(1)}x votre investissement initial`}
                      delay={0.3} />

                      </div>

                      {/* Texte explicatif rapide */}
                      <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, duration: 0.6 }}
                    className="py-2 pl-6 border-l-2 border-[#35a79b] max-w-4xl mx-auto">

                        <p className="text-[#edeae5] font-normal text-base leading-relaxed">
                          {(() => {
                        const patrimoine30 = resultat.patrimoine30 >= 1000000 ? `${(resultat.patrimoine30 / 1000000).toFixed(1)}M€` : `${Math.round(resultat.patrimoine30 / 1000)}K€`;
                        const cashflowMensuel30 = Math.round(resultat.cashflow30 / 12);
                        const multiple = (resultat.patrimoine30 / resultat.apportTotal).toFixed(1);
                        const apport = Math.round(resultat.apportTotal / 1000);

                        return `Votre stratégie vous permet de transformer un investissement initial de ${apport}K€ en un patrimoine net de ${patrimoine30} en 30 ans, soit un multiple de ${multiple}x. Vos actifs généreront ${cashflowMensuel30.toLocaleString('fr-FR')}€ de revenus mensuels, entièrement libres de crédit.`;
                      })()}
                        </p>
                      </motion.div>
                    </motion.div>
                }

                  {/* Slide 2 - Timeline */}
                {currentSlide === 1 &&
                <motion.div
                  key="slide-1"
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  transition={{ duration: 0.4 }}
                  className="relative">



    {/* Container principal de la Timeline */}
    <div className="relative rounded-[2rem] border border-[#282b2a] bg-[#0a0c0c]/50 shadow-2xl overflow-hidden">
      {/* Effet de lueur en arrière-plan */}

      <div className="relative p-6 md:p-10">
        
        {/* Section Sélecteur de Revenus - Design "Glassmorphism" */}
        <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2 }}
                        className="mb-12 p-6 rounded-md bg-gradient-to-br from-[#0a0c0c]/80 to-black border border-[#282b2a]/50 shadow-inner">

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1">
              <Label className="text-lg text-[#edeae5] font-normal font-semibold flex items-center gap-2">
                Objectif mensuel souhaité
              </Label>
              <p className="text-xs text-[#8b9391] font-normal">Revenus nets après crédit et charges</p>
            </div>

            <div className="flex flex-col gap-4 min-w-[300px]">
              <div className="grid grid-cols-4 gap-2">
                {['2000', '3000', '5000', '10000'].map((val) =>
                              <button
                                key={val}
                                onClick={() => setRevenusMensuels(val)}
                                className={`h-10 rounded-md border font-medium text-xs transition-all duration-300 ${
                                revenusMensuels === val ?
                                'bg-[#35a79b] border-[#35a79b] text-[#edeae5] shadow-[0_0_15px_rgba(42,157,143,0.4)]' :
                                'bg-[#0a0c0c]/50 border-[#282b2a] text-[#9aa19e] hover:border-[#6b7270]'}`
                                }>

                    {parseInt(val).toLocaleString()}€
                  </button>
                              )}
              </div>
              
              <div className="relative group">
                <input
                                type="number"
                                value={revenusMensuels}
                                onChange={(e) => setRevenusMensuels(e.target.value)}
                                placeholder="Montant personnalisé..."
                                className="w-full h-11 px-4 pr-12 rounded-md bg-[#0a0c0c] border border-[#282b2a] group-hover:border-[#35a79b]/50 focus:border-[#35a79b] text-[#edeae5] font-normal text-sm transition-all outline-none" />

                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6b7270] font-normal text-xs group-focus-within:text-[#35a79b]">€ / mois</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Composant de la Frise (Timeline) */}
        <ProjectTimeline
                        projets={projets}
                        frequence={frequence}
                        typeStrategie={typeStrategie}
                        strategiesData={strategiesData}
                        chartData={resultat.chartData}
                        revenusMensuels={revenusMensuels} />

        
      </div>
    </div>
  </motion.div>
                }

                  {/* Slide 3 - Graphiques Patrimoine et Cashflow */}
                  {currentSlide === 2 &&
                <motion.div
                  key="slide-2"
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  transition={{ duration: 0.4 }}
                  className="space-y-8">

                      <div className="grid lg:grid-cols-2 gap-6">
                        {/* Patrimoine */}
                        <div className="space-y-4">
                          <div className="relative h-fit rounded-[1.25rem] border-[0.75px] border-[#303332] p-2 md:rounded-[1.5rem] md:p-3">
                            <div className="relative bg-[#0e100f] border border-[#edeae5]/[0.12] p-6">
                              <PatrimoineChart data={resultat.chartData} />
                            </div>
                          </div>
                          <div className="relative h-fit rounded-[1.25rem] border-[0.75px] border-[#303332] p-2 md:rounded-[1.5rem] md:p-3">
                            <div className="relative bg-[#0e100f] border border-[#edeae5]/[0.12] p-6">
                              <div className="flex items-center gap-3 mb-4">
                                <TrendingUp className="w-4 h-4 text-[#35a79b]" />
                                <h3 className="text-lg text-[#edeae5] font-medium">Évolution du patrimoine financier et immobilier</h3>
                              </div>
                              <p className="text-[#edeae5] text-sm font-normal leading-relaxed mb-6">
                                Construction progressive de votre richesse immobilière sur 30 ans.
                              </p>
                              <div className="space-y-3">
                                <div className="p-3 rounded-lg bg-[#0a0c0c]/50 border border-[#282b2a]">
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="w-3 h-3 rounded-full bg-[#35a79b]"></div>
                                    <span className="text-xs text-[#edeae5] font-normal">Patrimoine net</span>
                                  </div>
                                  <p className="text-xs text-[#edeae5] font-normal leading-relaxed">
                                    Valeur réelle de votre richesse (biens - dettes).
                                  </p>
                                </div>
                                <div className="p-3 rounded-lg bg-[#0a0c0c]/50 border border-[#282b2a]">
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="w-3 h-3 rounded-full bg-red-400"></div>
                                    <span className="text-xs text-[#edeae5] font-normal">Dette restante</span>
                                  </div>
                                  <p className="text-xs text-[#edeae5] font-normal leading-relaxed">
                                    Capital restant dû sur vos crédits.
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Cashflow */}
                        <div className="space-y-4">
                          <div className="relative h-fit rounded-[1.25rem] border-[0.75px] border-[#303332] p-2 md:rounded-[1.5rem] md:p-3">
                            <div className="relative bg-[#0e100f] border border-[#edeae5]/[0.12] p-6">
                              <CashflowChart data={resultat.chartData} />
                            </div>
                          </div>
                          <div className="relative h-fit rounded-[1.25rem] border-[0.75px] border-[#303332] p-2 md:rounded-[1.5rem] md:p-3">
                            <div className="relative bg-[#0e100f] border border-[#edeae5]/[0.12] p-6">
                              <div className="flex items-center gap-3 mb-4">
                                <Wallet className="w-4 h-4 text-[#7fd3c9]" />
                                <h3 className="text-lg text-[#edeae5] font-medium">Revenus locatifs nets</h3>
                              </div>
                              <p className="text-[#edeae5] text-sm font-normal leading-relaxed mb-6">
                                Revenu disponible réel après toutes les charges.
                              </p>
                              <div className="space-y-3">
                                <div className="p-3 rounded-lg bg-[#0a0c0c]/50 border border-[#282b2a]">
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="w-3 h-3 rounded-full bg-[#3b82f6]"></div>
                                    <span className="text-xs text-[#edeae5] font-normal">Phase 1-20 • Construction</span>
                                  </div>
                                  <p className="text-xs text-[#edeae5] font-normal leading-relaxed">
                                    Investissement pour construire un patrimoine durable.
                                  </p>
                                </div>
                                <div className="p-3 rounded-lg bg-[#0a0c0c]/50 border border-[#282b2a]">
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="w-3 h-3 rounded-full bg-[#7fd3c9]"></div>
                                    <span className="text-xs text-[#edeae5] font-normal">Phase 20-30 • Liberté</span>
                                  </div>
                                  <p className="text-xs text-[#edeae5] font-normal leading-relaxed">
                                    Revenus mensuels importants sans crédit.
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                }

                  {/* Slide 4 - Carousel Projets */}
                  {currentSlide === 3 &&
                <motion.div
                  key="slide-3"
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  transition={{ duration: 0.4 }}
                  className="space-y-8">

                      <div>
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-2xl text-[#edeae5] font-normal font-semibold">Vos projets immobiliers</h3>
                          <div className="flex items-center gap-2">
                            <span className="text-[#9aa19e] text-sm font-normal">{currentProjIndex + 1} / {projets.length}</span>
                            {projets.length > 1 && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setCurrentProjIndex((prev) => (prev - 1 + projets.length) % projets.length)}
                                  className="text-[#edeae5] hover:bg-[#edeae5]/10 h-8 w-8"
                                >
                                  <ChevronLeft className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setCurrentProjIndex((prev) => (prev + 1) % projets.length)}
                                  className="text-[#edeae5] hover:bg-[#edeae5]/10 h-8 w-8"
                                >
                                  <ChevronRight className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="bg-[#0a0c0c] p-2 rounded-[1.25rem] relative border-[0.75px] border-[#303332] md:rounded-[1.5rem] md:p-3">
                          <Card className="relative bg-gradient-to-br from-[#0a0c0c]/95 via-[#35a79b]/5 to-[#0a0c0c]/95 overflow-hidden h-[320px] border-none">
                            <CardContent className="p-0 h-full">
                              <div className="h-full p-8 flex flex-col justify-center">
                                <div className="mb-6">
                                  <div className="text-xs text-[#35a79b] font-bold uppercase mb-2 font-normal">
                                    Année {currentProjIndex * frequence + 1}
                                  </div>
                                  <div className="text-5xl font-bold text-[#edeae5] mb-4 font-light">
                                    {projets[currentProjIndex].taille >= 1000 ? `${projets[currentProjIndex].taille / 1000}M€` : `${projets[currentProjIndex].taille}K€`}
                                  </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="bg-[#0a0c0c] p-5 rounded-lg border border-[#35a79b]/30">
                                    <p className="text-[#9aa19e] text-xs mb-2 font-normal">Apport nécessaire</p>
                                    <p className="text-[#ffe98a] text-2xl font-light">
                                      {Math.round(apportData[projets[currentProjIndex].taille] / 1000)}K€
                                    </p>
                                  </div>
                                  
                                  <div className="bg-[#7fd3c9]/10 rounded-lg p-5 border border-[#7fd3c9]/30">
                                    <p className="text-[#9aa19e] text-xs mb-2 font-normal">Stratégie</p>
                                    <p className="text-[#edeae5] text-2xl font-light">
                                      {typeStrategie === 'patrimoniale' ? 'Patrimoniale' : typeStrategie === 'agressive' ? 'Agressive' : 'Mixte'}
                                    </p>
                                  </div>
                                </div>

                                {/* Indicateurs */}
                                <div className="mt-6 flex gap-2 justify-center">
                                  {projets.map((_, idx) => (
                                    <button
                                      key={idx}
                                      onClick={() => setCurrentProjIndex(idx)}
                                      className={`h-1 rounded-full transition-all ${
                                        idx === currentProjIndex ?
                                        'w-6 bg-[#35a79b]' :
                                        'w-1 bg-[#343735] hover:bg-[#8b9391]'
                                      }`}
                                    />
                                  ))}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      </div>
                    </motion.div>
                }

                  {/* Slide 5 - Graphique comparatif */}
                  {currentSlide === 4 &&
                <motion.div
                  key="slide-4"
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  transition={{ duration: 0.4 }}>

                      <div className="relative h-fit rounded-[1.25rem] border-[0.75px] border-[#303332] p-2 md:rounded-[1.5rem] md:p-3">
                        <div className="relative bg-[#0e100f] border border-[#edeae5]/[0.12] p-6">
                          <ComparatifChart 
                            chartData={resultat.chartData}
                            projets={projets}
                            frequence={frequence}
                            apportData={apportData}
                            apportTotal={resultat.apportTotal}
                          />
                          <p className="text-[#edeae5] text-sm font-normal text-center mt-4">
                            Votre investissement de départ de {(resultat.apportTotal / 1000).toFixed(0)}K€ se transforme progressivement en un patrimoine de {(resultat.patrimoine30 / 1000000).toFixed(1)}M€.
                          </p>
                          
                          {/* Annotations */}
                          <div className="grid md:grid-cols-2 gap-4 mt-6">
                            <div className="p-4 rounded-lg bg-[#0a0c0c]/50 border border-[#7fd3c9]/30">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="px-2 py-1 rounded-full bg-[#35a79b] text-[#edeae5] text-xs font-bold">
                                  {(resultat.chartData[9].patrimoine / resultat.apportTotal).toFixed(1)}x
                                </div>
                                <span className="text-xs text-[#edeae5] font-normal">An 10</span>
                              </div>
                              <p className="text-xs text-[#edeae5]/70">
                                Votre patrimoine vaut déjà {(resultat.chartData[9].patrimoine / resultat.apportTotal).toFixed(1)} fois votre investissement initial
                              </p>
                            </div>
                            <div className="p-4 rounded-lg bg-[#0a0c0c]/50 border border-[#7fd3c9]/30">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="px-2 py-1 rounded-full bg-[#35a79b] text-[#edeae5] text-xs font-bold">
                                  {(resultat.chartData[19].patrimoine / resultat.apportTotal).toFixed(1)}x
                                </div>
                                <span className="text-xs text-[#edeae5] font-normal">An 20</span>
                              </div>
                              <p className="text-xs text-[#edeae5]/70">
                                Votre patrimoine représente {(resultat.chartData[19].patrimoine / resultat.apportTotal).toFixed(1)} fois votre mise de départ
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                            </motion.div>
                }

                  {/* Slide 6 - Tableau détaillé */}
                  {currentSlide === 5 &&
                <motion.div
                  key="slide-5"
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  transition={{ duration: 0.4 }}>

                      <div className="relative h-fit rounded-[1.25rem] border-[0.75px] border-[#303332] p-2 md:rounded-[1.5rem] md:p-3">
                        <motion.div
                      initial={{ opacity: 0, y: 40 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="relative bg-[#0e100f] border border-[#edeae5]/[0.12]">
                       
                        <div className="p-6 border-b border-[#282b2a] bg-[#edeae5]/5"> 
                          <div className="flex items-center gap-2"> 
                            <BarChart3 className="text-[#7fd3c9] lucide lucide-chart-column w-5 h-5" /> 
                            <h3 className="text-lg text-[#edeae5] font-medium">Détail par année</h3> 
                          </div> 
                        </div> 

                        <div className="overflow-x-auto"> 
                          <table className="w-full text-sm"> 
                            <thead> 
                              <tr className="border-b text-xs uppercase tracking-wider border-[#282b2a] bg-[#edeae5]/5"> 
                                <th className="text-left py-4 px-6 text-[#9aa19e]">Année</th> 
                                <th className="text-right py-4 px-6 text-[#9aa19e]">Patrimoine net</th> 
                                <th className="text-right py-4 px-6 text-[#9aa19e]">Cashflow annuel</th> 
                                <th className="text-right py-4 px-6 text-[#9aa19e]">Capital restant</th> 
                              </tr> 
                            </thead> 
                            <tbody className="divide-y divide-[#282b2a]"> 
                              {resultat.chartData.map((row, index) =>
                            <React.Fragment key={`${resultat.apportTotal}-${index}`}> 
                                  <motion.tr
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.01 }}
                                whileHover={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
                                className="cursor-pointer group"
                                onClick={() => row.detailsProjets.length > 0 && toggleYearExpansion(row.annee)}>
                                 
                                    <td className="py-4 px-6 text-[#edeae5] font-medium"> 
                                      <div className="flex items-center gap-3"> 
                                        {row.detailsProjets.length > 0 &&
                                    <span className="text-[#00FFD1] text-[10px] transition-transform duration-300"> 
                                            {expandedYears.includes(row.annee) ? '▼' : '▶'} 
                                          </span>
                                    } 
                                        <span>An {row.annee}</span> 
                                      </div> 
                                    </td> 
                                    <td className="py-4 px-6 text-right text-[#edeae5]"> 
                                      {row.patrimoine >= 1000000 ? `${(row.patrimoine / 1000000).toFixed(1)}M €` : `${Math.round(row.patrimoine / 1000)}K €`} 
                                    </td> 
                                    <td className={`py-4 px-6 text-right font-medium ${row.cashflow >= 0 ? 'text-[#00FFD1]' : 'text-red-400'}`}> 
                                      {row.cashflow >= 1000000 ? `${(row.cashflow / 1000000).toFixed(1)}M €` : `${Math.round(row.cashflow / 1000)}K €`} 
                                    </td> 
                                    <td className="py-4 px-6 text-right text-[#d3d8d6]"> 
                                      {row.capitalRestant >= 1000000 ? `${(row.capitalRestant / 1000000).toFixed(1)}M €` : `${Math.round(row.capitalRestant / 1000)}K €`} 
                                    </td> 
                                  </motion.tr> 
                                  
                                  <AnimatePresence>
                                    {expandedYears.includes(row.annee) &&
                                <motion.tr
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}>

                                        <td colSpan="4" className="bg-[#edeae5]/[0.02] px-6 py-0">
                                          <div className="border-l-2 border-[#00FFD1]/30 ml-2 my-2">
                                            {row.detailsProjets.map((detail, dIdx) =>
                                      <div key={dIdx} className="grid grid-cols-4 py-2 pl-4 text-[11px] text-[#9aa19e]">
                                                <span>Projet {detail.projetIndex}</span>
                                                <span className="text-right">{Math.round(detail.patrimoine / 1000)}K €</span>
                                                <span className="text-right">{Math.round(detail.cashflow / 1000)}K €</span>
                                                <span className="text-right">{Math.round(detail.capitalRestant / 1000)}K €</span>
                                              </div>
                                      )}
                                          </div>
                                        </td>
                                      </motion.tr>
                                }
                                  </AnimatePresence>
                                </React.Fragment>
                            )} 
                            </tbody> 
                          </table> 
                        </div> 
                        </motion.div>
                      </div>
                    </motion.div>
                }
                </AnimatePresence>
              </div>

              {/* Indicateurs de slides */}
              <div className="flex items-center justify-center gap-2 mt-8 mb-4">
                {[0, 1, 2, 3, 4, 5].map((index) =>
              <button
                key={index}
                onClick={() => setCurrentSlide(index)}
                className={`h-2 rounded-full transition-all ${
                currentSlide === index ?
                'w-8 bg-[#35a79b]' :
                'w-2 bg-[#303332] hover:bg-[#6b7270]'}`
                } />

              )}
              </div>

              {/* Anciennes sections - À supprimer */}
              <div className="hidden">
              {/* Projections détaillées */}
              <div className="my-16 space-y-6">
                {/* Projection à 20 ans */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ duration: 0.6 }}
                  className="py-2 pl-6 border-l-2 border-[#35a79b]">

                  <div className="text-[10px] tracking-[0.2em] uppercase text-[#7fd3c9] mb-3">Étape clé • An 20</div>
                  <p className="text-[#edeae5] font-normal text-sm md:text-base leading-[1.8] max-w-3xl">
                    {(() => {
                      const patrimoine = resultat.patrimoine20 >= 1000000 ? `${(resultat.patrimoine20 / 1000000).toFixed(1)}M€` : `${Math.round(resultat.patrimoine20 / 1000)}K€`;
                      const cashflowMensuel = Math.round(resultat.cashflow20 / 12);
                      const ageIn20Years = age ? parseInt(age) + 20 : null;

                      // Retraite - Seul(e)
                      if (objectif === 'retraite' && typeInvestissement === 'seule') {
                        const ageText = ageIn20Years ? `, à ${ageIn20Years} ans` : '';
                        return resultat.cashflow20 >= 0 ?
                        `Dans 20 ans${ageText}, votre patrimoine net s'élèvera à ${patrimoine}. Grâce à vos investissements commerciaux, vous disposerez de revenus locatifs de ${cashflowMensuel.toLocaleString('fr-FR')}€ chaque mois, vous permettant d'envisager une retraite sereine et progressive.` :
                        `Dans 20 ans${ageText}, votre patrimoine net atteindra ${patrimoine}. Vos investissements continueront de prendre de la valeur pour vous offrir des revenus complémentaires lors de votre retraite.`;
                      }

                      // Retraite - Couple
                      if (objectif === 'retraite' && typeInvestissement === 'couple') {
                        const ageText = ageIn20Years ? `, à ${ageIn20Years} ans` : '';
                        return resultat.cashflow20 >= 0 ?
                        `Dans 20 ans${ageText}, votre patrimoine commun s'élèvera à ${patrimoine}. Ensemble, vous bénéficierez de revenus locatifs de ${cashflowMensuel.toLocaleString('fr-FR')}€ par mois, vous permettant d'envisager une retraite confortable à deux et de profiter pleinement de cette nouvelle étape de vie.` :
                        `Dans 20 ans${ageText}, votre patrimoine immobilier commun atteindra ${patrimoine}. Ces investissements vous permettront de sécuriser financièrement votre retraite à deux et de maintenir votre niveau de vie.`;
                      }

                      // Retraite - Famille
                      if (objectif === 'retraite' && typeInvestissement === 'famille') {
                        const ageText = ageIn20Years ? `, lorsque vous aurez ${ageIn20Years} ans` : '';
                        return resultat.cashflow20 >= 0 ?
                        `Dans 20 ans${ageText}, votre patrimoine familial s'élèvera à ${patrimoine}. Ces investissements génèreront ${cashflowMensuel.toLocaleString('fr-FR')}€ de revenus mensuels, vous permettant non seulement de préparer votre retraite, mais aussi de constituer un héritage solide pour les générations futures.` :
                        `Dans 20 ans${ageText}, votre patrimoine familial atteindra ${patrimoine}. Ces actifs immobiliers constituent une base solide pour votre retraite et un héritage durable que vous pourrez transmettre à vos proches.`;
                      }

                      // Patrimoine - Tous types
                      if (objectif === 'patrimoine' && typeInvestissement === 'seule') {
                        return resultat.cashflow20 >= 0 ?
                        `Dans 20 ans, votre patrimoine personnel atteindra ${patrimoine}, générant ${cashflowMensuel.toLocaleString('fr-FR')}€ de revenus locatifs mensuels. Cette stratégie patrimoniale vous offre à la fois une source de revenus stable et une appréciation continue de votre capital immobilier.` :
                        `Dans 20 ans, votre patrimoine personnel s'élèvera à ${patrimoine}. Vos investissements immobiliers continueront de prendre de la valeur, vous constituant une base financière solide pour l'avenir.`;
                      }

                      if (objectif === 'patrimoine' && typeInvestissement === 'couple') {
                        return resultat.cashflow20 >= 0 ?
                        `Dans 20 ans, votre patrimoine de couple atteindra ${patrimoine}, générant ${cashflowMensuel.toLocaleString('fr-FR')}€ de revenus mensuels. Cette stratégie patrimoniale commune vous assure des revenus réguliers tout en construisant un capital immobilier significatif.` :
                        `Dans 20 ans, votre patrimoine commun s'élèvera à ${patrimoine}. Ces investissements immobiliers constituent une richesse partagée qui continuera de croître pour sécuriser votre avenir à deux.`;
                      }

                      if (objectif === 'patrimoine' && typeInvestissement === 'famille') {
                        return resultat.cashflow20 >= 0 ?
                        `Dans 20 ans, votre patrimoine familial atteindra ${patrimoine}, générant ${cashflowMensuel.toLocaleString('fr-FR')}€ de revenus mensuels. Cette stratégie patrimoniale transgénérationnelle vous permet de constituer un capital immobilier important tout en bénéficiant de revenus réguliers.` :
                        `Dans 20 ans, votre patrimoine familial s'élèvera à ${patrimoine}. Ces investissements immobiliers représentent un héritage durable et une sécurité financière pour toute votre famille.`;
                      }

                      // Diversification - Tous types
                      if (objectif === 'diversification' && typeInvestissement === 'seule') {
                        return resultat.cashflow20 >= 0 ?
                        `Dans 20 ans, votre portefeuille diversifié atteindra ${patrimoine}, générant ${cashflowMensuel.toLocaleString('fr-FR')}€ de revenus mensuels. Cette stratégie de diversification immobilière vous offre à la fois sécurité et performance, répartissant les risques sur plusieurs actifs commerciaux.` :
                        `Dans 20 ans, votre portefeuille immobilier diversifié s'élèvera à ${patrimoine}. Cette stratégie multi-actifs vous permet de sécuriser vos investissements tout en maximisant leur potentiel d'appréciation.`;
                      }

                      if (objectif === 'diversification' && typeInvestissement === 'couple') {
                        return resultat.cashflow20 >= 0 ?
                        `Dans 20 ans, votre portefeuille immobilier commun atteindra ${patrimoine}, générant ${cashflowMensuel.toLocaleString('fr-FR')}€ de revenus mensuels. Cette stratégie de diversification vous permet de répartir les risques tout en construisant ensemble un patrimoine solide et performant.` :
                        `Dans 20 ans, votre portefeuille diversifié commun s'élèvera à ${patrimoine}. Cette approche multi-actifs vous offre une sécurité accrue et des perspectives de croissance pour votre patrimoine à deux.`;
                      }

                      if (objectif === 'diversification' && typeInvestissement === 'famille') {
                        return resultat.cashflow20 >= 0 ?
                        `Dans 20 ans, votre portefeuille familial diversifié atteindra ${patrimoine}, générant ${cashflowMensuel.toLocaleString('fr-FR')}€ de revenus mensuels. Cette stratégie multi-actifs assure une protection optimale du patrimoine familial tout en maintenant un potentiel de croissance élevé.` :
                        `Dans 20 ans, votre portefeuille immobilier familial s'élèvera à ${patrimoine}. Cette diversification stratégique protège le patrimoine familial et assure sa transmission dans les meilleures conditions.`;
                      }

                      return '';
                    })()}
                  </p>
                </motion.div>

                {/* Projection à 25 ans */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ duration: 0.6, delay: 0.1 }}
                  className="py-2 pl-6 border-l-2 border-[#7fd3c9]">

                  <div className="text-[10px] tracking-[0.2em] uppercase text-[#7fd3c9] mb-3">Accélération • An 25</div>
                  <p className="text-[#edeae5] font-normal text-sm md:text-base leading-[1.8] max-w-3xl">
                    {(() => {
                      const patrimoine = resultat.patrimoine25 >= 1000000 ? `${(resultat.patrimoine25 / 1000000).toFixed(1)}M€` : `${Math.round(resultat.patrimoine25 / 1000)}K€`;
                      const cashflowMensuel = Math.round(resultat.cashflow25 / 12);
                      const ageIn25Years = age ? parseInt(age) + 25 : null;
                      const ageText = ageIn25Years ? ` (vous aurez ${ageIn25Years} ans)` : '';

                      return `À l'an 25${ageText}, l'effet boule de neige commence réellement à se manifester. Votre patrimoine atteint ${patrimoine}, et vos revenus locatifs s'élèvent désormais à ${cashflowMensuel.toLocaleString('fr-FR')}€ par mois. C'est le moment où votre stratégie d'investissement commence vraiment à porter ses fruits.`;
                    })()}
                  </p>
                </motion.div>

                {/* Projection à 30 ans */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="py-5 pl-6 pr-6 border-l-2 border-[#e0c9a0] bg-[#e0c9a0]/[0.05]">

                  <div className="text-[10px] tracking-[0.2em] uppercase text-[#7fd3c9] mb-3">Objectif atteint • An 30</div>
                  <p className="text-[#edeae5] font-normal text-sm md:text-base leading-[1.8] max-w-3xl">
                    {(() => {
                      const patrimoine = resultat.patrimoine30 >= 1000000 ? `${(resultat.patrimoine30 / 1000000).toFixed(1)}M€` : `${Math.round(resultat.patrimoine30 / 1000)}K€`;
                      const cashflowMensuel = Math.round(resultat.cashflow30 / 12);
                      const cashflowAnnuel = resultat.cashflow30 >= 1000000 ? `${(resultat.cashflow30 / 1000000).toFixed(1)}M€` : `${Math.round(resultat.cashflow30 / 1000)}K€`;
                      const ageIn30Years = age ? parseInt(age) + 30 : null;
                      const ageText = ageIn30Years ? ` À ${ageIn30Years} ans` : '';
                      const multiple = (resultat.patrimoine30 / resultat.apportTotal).toFixed(1);

                      return `${ageText}, après 30 ans de stratégie patrimoniale, vous avez transformé votre apport initial de ${Math.round(resultat.apportTotal / 1000)}K€ en un patrimoine net de ${patrimoine}, soit un multiple de ${multiple}x. Vos actifs immobiliers génèrent ${cashflowMensuel.toLocaleString('fr-FR')}€ de revenus mensuels (${cashflowAnnuel} par an), entièrement libres de tout crédit. `;
                    })()}
                  </p>
                </motion.div>
              </div>

              {/* Stats clés + Carte */}
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.6 }}
                className="grid lg:grid-cols-[1fr_1.2fr] gap-6 mb-12 items-start">

              <div className="grid md:grid-cols-1 gap-6">
                <AnimatedStatCard
                    icon={TrendingUp}
                    title="Patrimoine à 20 ans"
                    value={resultat.patrimoine20}
                    suffix="€"
                    description="Étape clé de votre stratégie"
                    delay={0.1} />


                <AnimatedStatCard
                    icon={Wallet}
                    title="Investissement initial"
                    value={resultat.apportTotal}
                    suffix="€"
                    description={`Apport total nécessaire pour ${projets.length} projet${projets.length > 1 ? 's' : ''}`}
                    delay={0.2} />


                <AnimatedStatCard
                    icon={TrendingUp}
                    title="Patrimoine à 30 ans"
                    value={resultat.patrimoine30}
                    suffix="€"
                    description={`Soit un multiple de ${(resultat.patrimoine30 / resultat.apportTotal).toFixed(1)}x votre investissement initial`}
                    delay={0.3} />

              </div>

              {projets.length > 0 &&
                <motion.div
                  initial={{ opacity: 0, x: 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2, duration: 0.6 }}>

                  <InteractiveFranceMap projets={projets} />
                </motion.div>
                }
              </motion.div>

              {/* Paragraphe explicatif avant la timeline */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.6 }}
                className="my-12 max-w-4xl mx-auto">

                <p className="text-[#edeae5] text-base font-normal leading-relaxed text-center">
                  Votre stratégie d'investissement s'étale sur 30 ans, avec des acquisitions régulières selon le rythme que vous avez défini. 
                  Chaque projet immobilier commercial vient renforcer votre patrimoine et diversifier vos sources de revenus. 
                  La timeline ci-dessous visualise l'échelonnement de vos investissements dans le temps, vous permettant de comprendre 
                  comment votre portefeuille se construit progressivement pour atteindre vos objectifs financiers.
                </p>
              </motion.div>

              {/* Timeline des projets */}
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.7, ease: "easeOut" }}
                className="mb-12 relative h-fit rounded-[1.25rem] p-2 md:rounded-[1.5rem] md:p-3 transition-all duration-500">

                <div className="relative bg-[#0e100f] border border-[#edeae5]/[0.12] p-6 pt-10">
                  {/* Question revenus mensuels souhaités */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="mb-6 p-4 rounded-lg bg-gradient-to-br from-[#35a79b]/10 to-black/30 border border-[#35a79b]/30">

                    <Label className="text-sm text-[#edeae5] mb-3 block font-medium">
                      Revenus mensuels souhaités
                    </Label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                      {[
                      { value: '2000', label: '2 000€' },
                      { value: '3000', label: '3 000€' },
                      { value: '5000', label: '5 000€' },
                      { value: '10000', label: '10 000€' }].
                      map((option) =>
                      <button
                        key={option.value}
                        onClick={() => setRevenusMensuels(option.value)}
                        className={`h-9 rounded-lg border-2 font-medium text-xs transition-all ${
                        revenusMensuels === option.value ?
                        'bg-[#35a79b] border-[#35a79b] text-[#edeae5]' :
                        'bg-[#0a0c0c]/30 border-[#282b2a] text-[#9aa19e] hover:border-[#303332]'}`
                        }>

                          {option.label}
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        value={revenusMensuels}
                        onChange={(e) => setRevenusMensuels(e.target.value)}
                        placeholder="Personnalisé"
                        className="w-full h-9 px-3 pr-12 rounded-lg bg-[#0a0c0c]/50 border-2 border-[#282b2a] hover:border-[#35a79b] focus:border-[#35a79b] text-[#edeae5] font-normal text-xs transition-colors outline-none" />

                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b9391] font-normal text-xs">€/mois</span>
                    </div>
                  </motion.div>

                  <ProjectTimeline projets={projets} frequence={frequence} typeStrategie={typeStrategie} strategiesData={strategiesData} chartData={resultat.chartData} revenusMensuels={revenusMensuels} />
                </div>
              </motion.div>

              {/* Paragraphe explicatif avant l'analyse détaillée */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.6 }}
                className="my-12 max-w-4xl mx-auto">

                <p className="text-[#edeae5] text-base font-normal leading-relaxed text-center">
                  Pour bien comprendre votre stratégie patrimoniale, il est essentiel d'analyser en détail l'évolution de vos indicateurs financiers. 
                  Les graphiques ci-dessous vous permettent de visualiser précisément comment votre patrimoine se construit année après année, 
                  et comment vos revenus locatifs évoluent au fil du temps pour vous offrir une liberté financière progressive.
                </p>
              </motion.div>

              {/* Graphique investissement vs patrimoine */}
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.6 }}
                className="mb-12">

                <div className="relative h-fit rounded-[1.5rem] border border-[#282b2a] bg-[#0a0c0c] backdrop-blur-md overflow-hidden">
                  <div className="p-6 border-b border-[#282b2a] bg-[#0a0c0c]">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-[#e0c9a0]" />
                      <h3 className="text-lg text-[#edeae5] font-medium">Investissement vs Patrimoine</h3>
                    </div>
                  </div>
                  <div className="p-6">
                    <ResponsiveContainer width="100%" height={400}>
                      <LineChart data={resultat.chartData}>
                        <defs>
                          <linearGradient id="patrimoineGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#35a79b" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#35a79b" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="investGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#e0c9a0" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#e0c9a0" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis
                          dataKey="annee"
                          stroke="#9ca3af"
                          tick={{ fontSize: 12, fill: '#9ca3af' }}
                          label={{ value: 'Année', position: 'insideBottom', offset: -5, fill: '#9ca3af' }} />

                        <YAxis
                          stroke="#9ca3af"
                          tick={{ fontSize: 12, fill: '#9ca3af' }}
                          tickFormatter={(value) => {
                            if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                            return `${(value / 1000).toFixed(0)}K`;
                          }}
                          label={{ value: 'Euros', angle: -90, position: 'insideLeft', fill: '#9ca3af' }} />

                        <Tooltip
                          contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }}
                          labelStyle={{ color: '#fff' }}
                          formatter={(value) => `${(value / 1000).toFixed(0)}K €`} />

                        <Legend />
                        <Line
                          type="monotone"
                          dataKey={() => resultat.apportTotal}
                          stroke="#e0c9a0"
                          strokeWidth={3}
                          strokeDasharray="5 5"
                          name="Investissement initial"
                          dot={false} />

                        <Area
                          type="monotone"
                          dataKey="patrimoine"
                          stroke="#35a79b"
                          strokeWidth={3}
                          fill="url(#patrimoineGradient)"
                          name="Patrimoine net" />

                        <Line
                          type="monotone"
                          dataKey="patrimoine"
                          stroke="#35a79b"
                          strokeWidth={4}
                          name=""
                          dot={false}
                          legendType="none" />

                      </LineChart>
                    </ResponsiveContainer>
                    <p className="text-[#edeae5] text-sm font-normal text-center mt-4">
                      Votre investissement de départ de {(resultat.apportTotal / 1000).toFixed(0)}K€ se transforme progressivement en un patrimoine de {(resultat.patrimoine30 / 1000000).toFixed(1)}M€.
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Graphiques et explications - Section séparée */}
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.6 }}
                className="mb-12 space-y-8">

                <h3 className="text-2xl text-[#edeae5] font-normal font-semibold mb-8">Analyse détaillée</h3>

                {/* Patrimoine - Graphique + Explication */}
                <div className="grid lg:grid-cols-[1fr_2fr] gap-6">
                  <motion.div
                    initial={{ opacity: 0, x: -40 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 0.6 }}
                    className="relative">

                    <div className="relative bg-[#0e100f] border border-[#edeae5]/[0.12] p-6">
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2, duration: 0.4 }}
                        className="flex items-center gap-3 mb-4">

                        <TrendingUp className="w-4 h-4 text-[#35a79b]" />
                        <h3 className="text-lg text-[#edeae5] font-medium">Évolution du patrimoine</h3>
                      </motion.div>
                      <motion.p
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.3, duration: 0.4 }}
                        className="text-[#edeae5] text-sm font-normal leading-relaxed mb-6">

                        Ce graphique illustre la construction progressive de votre richesse immobilière sur 30 ans. Deux courbes essentielles vous permettent de comprendre votre situation financière réelle.
                      </motion.p>
                      <div className="space-y-4">
                        <motion.div
                          initial={{ opacity: 0, x: -20 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: 0.4, duration: 0.5 }}
                          className="p-4 rounded-lg bg-[#0a0c0c]/50 border border-[#282b2a]">

                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-3 h-3 rounded-full bg-[#35a79b]"></div>
                            <span className="text-xs text-[#edeae5] font-normal uppercase tracking-wider">Courbe verte • Patrimoine net</span>
                          </div>
                          <p className="text-xs text-[#edeae5] font-normal leading-relaxed">
                            Votre patrimoine net représente la valeur réelle de votre richesse : la valeur de marché de vos biens moins les dettes restantes. Chaque mensualité que vous payez augmente automatiquement votre patrimoine net.
                          </p>
                        </motion.div>
                        <motion.div
                          initial={{ opacity: 0, x: -20 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: 0.5, duration: 0.5 }}
                          className="p-4 rounded-lg bg-[#0a0c0c]/50 border border-[#282b2a]">

                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-3 h-3 rounded-full bg-red-400"></div>
                            <span className="text-xs text-[#edeae5] font-normal uppercase tracking-wider">Courbe rouge • Dette restante</span>
                          </div>
                          <p className="text-xs text-[#edeae5] font-normal leading-relaxed">
                            Cette courbe pointillée montre le capital restant dû sur l'ensemble de vos crédits immobiliers. Elle décroît linéairement jusqu'à atteindre zéro à l'an 20 (fin du crédit typique). Le moment où les deux courbes se croisent marque un tournant psychologique important dans votre parcours d'investisseur.
                          </p>
                        </motion.div>
                        
                      </div>
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    className="relative">

                    <div className="relative bg-[#0e100f] border border-[#edeae5]/[0.12] p-6">
                      <PatrimoineChart data={resultat.chartData} />
                    </div>
                  </motion.div>
                </div>

                {/* Cashflow - Graphique + Explication */}
                <div className="grid lg:grid-cols-[1fr_2fr] gap-6">
                  <motion.div
                    initial={{ opacity: 0, x: -40 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    className="relative">

                    <div className="relative bg-[#0e100f] border border-[#edeae5]/[0.12] p-6">
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2, duration: 0.4 }}
                        className="flex items-center gap-3 mb-4">

                        <Wallet className="w-4 h-4 text-[#7fd3c9]" />
                        <h3 className="text-lg text-[#edeae5] font-medium">Revenus locatifs nets</h3>
                      </motion.div>
                      <motion.p
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.3, duration: 0.4 }}
                        className="text-[#edeae5] text-sm font-normal leading-relaxed mb-6">

                        Le cashflow annuel représente votre revenu disponible réel une fois toutes les charges payées. C'est l'argent qui arrive effectivement sur votre compte chaque année.
                      </motion.p>
                      <div className="space-y-4">
                        <motion.div
                          initial={{ opacity: 0, x: -20 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: 0.4, duration: 0.5 }}
                          className="p-4 rounded-lg bg-[#0a0c0c]/50 border border-[#282b2a]">

                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-3 h-3 rounded-full bg-[#3b82f6]"></div>
                            <span className="text-xs text-[#edeae5] font-normal uppercase tracking-wider">Phase 1-20 • Construction</span>
                          </div>
                          <p className="text-xs text-[#edeae5] font-normal leading-relaxed">
                            Cette phase est un investissement : vous sacrifiez du cashflow immédiat pour construire un patrimoine durable. Même si le cashflow est faible, votre patrimoine croît rapidement en arrière-plan.
                          </p>
                        </motion.div>
                        <motion.div
                          initial={{ opacity: 0, x: -20 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: 0.5, duration: 0.5 }}
                          className="p-4 rounded-lg bg-[#0a0c0c]/50 border border-[#282b2a]">

                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-3 h-3 rounded-full bg-[#7fd3c9]"></div>
                            <span className="text-xs text-[#edeae5] font-normal uppercase tracking-wider">Phase 20-30 • Liberté financière</span>
                          </div>
                          <p className="text-xs text-[#edeae5] font-normal leading-relaxed">
                            C'est le début de votre véritable liberté financière. Chaque mois, des dizaines de milliers d'euros arrivent sur votre compte sans que vous ayez à travailler pour les obtenir. Vous pouvez choisir de continuer votre activité professionnelle par passion plutôt que par nécessité, ou prendre une retraite anticipée.
                          </p>
                        </motion.div>
                        
                      </div>
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 0.6, delay: 0.4 }}
                    className="relative">

                    <div className="relative bg-[#0e100f] border border-[#edeae5]/[0.12] p-6">
                      <CashflowChart data={resultat.chartData} />
                    </div>
                  </motion.div>
                </div>
              </motion.div>



            </div>
          </div>
          }

          {/* Formulaire de configuration - Style moderne */}
          {!resultat &&
          <motion.div
            ref={formRef}
            initial={{ opacity: 0, y: 20 }}
            animate={formInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6 }}
            className="mt-10 mb-12 grid lg:grid-cols-[1fr_2fr] gap-12 items-start relative">

    {/* Éléments de background colorés */}
    {/* --- PARTIE GAUCHE : Titre et CTA --- */}
    <div className="space-y-8 max-w-md">
      <div>
        <h2 className="text-[38px] md:text-[50px] font-light tracking-[-0.02em] leading-[1.08] mb-4">
          <span className="text-[#edeae5]">Configurez. Planifiez.</span><br />
          <span className="text-[#e0c9a0] font-light">Investissez.</span>
        </h2>
        <p className="text-[#edeae5] text-base font-normal ">
          Visualisez l'évolution de votre patrimoine immobilier sur 30 ans.<br />
          {getDescriptionText()}
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[#0a0c0c]/50 border border-[#282b2a] rounded-md p-6 text-center">
          <div className="mb-3 flex justify-center">
            <TrendingUp className="w-8 h-8 text-[#edeae5]" />
          </div>
          <div className="text-[#edeae5] font-semibold text-base mb-1 font-normal">Patrimoine net</div>
          <div className="text-xs text-[#9aa19e] font-normal">Évolution sur 30 ans</div>
        </div>
        <div className="bg-[#0a0c0c]/50 border border-[#282b2a] rounded-md p-6 text-center">
          <div className="mb-3 flex justify-center">
            <DollarSign className="w-8 h-8 text-[#edeae5]" />
          </div>
          <div className="text-[#edeae5] font-semibold text-base mb-1 font-normal">Cashflow annuel</div>
          <div className="text-xs text-[#9aa19e] font-normal">Projection détaillée</div>
        </div>
      </div>
    </div>

    {/* --- PARTIE DROITE : Configuration --- */}
    <div className="grid gap-6 items-start md:grid-cols-1">

      {/* Colonne : Configuration (S'étire pour remplir l'espace).
          Le cadre est peint par la couche du dessous, comme sur l'accueil :
          un filet constant, plus un dégradé conique qui tourne lentement —
          la lueur blanche qui parcourt le bord. */}
      <div className="relative p-px overflow-hidden bg-[#edeae5]/[0.12]">
        <div
          aria-hidden="true"
          className="absolute inset-[-100%] animate-[spin_10s_linear_infinite]"
          style={{ background: "conic-gradient(rgba(237,234,229,0) 0deg, rgba(237,234,229,0) 288deg, rgba(237,234,229,0.9) 332deg, rgba(237,234,229,0) 360deg)" }}
        />
        <div className="relative bg-[#0e100f] p-6 md:p-8">
          {/* Progress Bar */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-[#9aa19e] font-normal uppercase tracking-wider">Étape {currentStep} sur 4</span>
              <span className="text-xs text-[#35a79b] font-medium">{Math.round(currentStep / 4 * 100)}%</span>
            </div>
            <div className="h-1.5 bg-[#171918] rounded-full overflow-hidden">
              <motion.div
                        className="h-full bg-gradient-to-r from-[#35a79b] to-[#7fd3c9]"
                        initial={{ width: 0 }}
                        animate={{ width: `${currentStep / 4 * 100}%` }}
                        transition={{ duration: 0.5, ease: "easeOut" }} />

            </div>
          </div>

          <AnimatePresence mode="wait">
            {/* Étape 1: Informations personnelles */}
            {currentStep === 1 &&
                    <motion.div
                      key="step1"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3 }}>

                <h3 className="text-2xl text-[#edeae5] font-medium mb-3">
                  Parlez-nous de vous
                </h3>
                <p className="text-[#edeae5] text-sm mb-8 font-normal">
                  Commençons par quelques informations de base pour personnaliser votre stratégie.
                </p>

                <div className="space-y-6">
                  <div>
                    <Label className="text-sm text-[#edeae5] mb-3 block font-normal">Quel est votre âge ?</Label>
                    <input
                            type="number"
                            value={age}
                            onChange={(e) => setAge(e.target.value)}
                            placeholder="Ex: 35"
                            className="w-full h-14 px-5 rounded-md bg-[#0a0c0c]/50 border-2 border-[#282b2a] hover:border-[#35a79b] focus:border-[#35a79b] text-[#edeae5] text-lg font-normal transition-colors outline-none" />

                  </div>

                  <div>
                    <Label className="text-sm text-[#edeae5] mb-3 block font-normal">Vous investissez...</Label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                            { value: 'seule', label: 'Seul(e)' },
                            { value: 'couple', label: 'En couple' },
                            { value: 'famille', label: 'En famille' }].
                            map((option) =>
                            <button
                              key={option.value}
                              onClick={() => setTypeInvestissement(option.value)}
                              className={`h-14 rounded-md border-2 font-medium text-sm transition-all ${
                              typeInvestissement === option.value ?
                              'bg-[#35a79b] border-[#35a79b] text-[#edeae5]' :
                              'bg-[#0a0c0c]/30 border-[#282b2a] text-[#9aa19e] hover:border-[#303332]'}`
                              }>

                          {option.label}
                        </button>
                            )}
                    </div>
                  </div>
                </div>
              </motion.div>
                    }

            {/* Étape 2: Objectif d'investissement */}
            {currentStep === 2 &&
                    <motion.div
                      key="step2"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3 }}>

                <h3 className="text-2xl text-[#edeae5] font-medium mb-3">
                  Quel est votre objectif ?
                </h3>
                <p className="text-[#edeae5] text-sm mb-8 font-normal">
                  Définissons ensemble ce que vous souhaitez accomplir avec vos investissements.
                </p>

                <div className="space-y-4">
                  {[
                        { value: 'retraite', label: 'Préparer ma retraite', desc: 'Générer des revenus passifs pour l\'avenir' },
                        { value: 'patrimoine', label: 'Construire un patrimoine', desc: 'Développer et transmettre un capital' },
                        { value: 'diversification', label: 'Diversifier mes actifs', desc: 'Répartir les risques et sécuriser' }].
                        map((option) =>
                        <button
                          key={option.value}
                          onClick={() => setObjectif(option.value)}
                          className={`w-full p-5 rounded-md border-2 text-left transition-all ${
                          objectif === option.value ?
                          'bg-[#35a79b]/10 border-[#35a79b]' :
                          'bg-[#0a0c0c]/30 border-[#282b2a] hover:border-[#303332]'}`
                          }>

                      <div className="flex items-start gap-4">
                        <div className={`mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            objectif === option.value ? 'border-[#35a79b]' : 'border-[#303332]'}`
                            }>
                          {objectif === option.value && <div className="w-3 h-3 rounded-full bg-[#35a79b]" />}
                        </div>
                        <div>
                          <div className={`font-medium mb-1 ${
                              objectif === option.value ? 'text-[#edeae5]' : 'text-[#d3d8d6]'}`
                              }>
                            {option.label}
                          </div>
                          <div className="text-sm text-[#edeae5]/70 font-normal">{option.desc}</div>
                        </div>
                      </div>
                    </button>
                        )}
                </div>
              </motion.div>
                    }

            {/* Étape 3: Stratégie d'investissement */}
            {currentStep === 3 &&
                    <motion.div
                      key="step3"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3 }}>

                <h3 className="text-2xl text-[#edeae5] font-medium mb-3">
                  Choisissez votre stratégie
                </h3>
                <p className="text-[#edeae5] text-sm mb-8 font-normal">
                  Sélectionnez le niveau de rendement qui correspond à votre profil d'investisseur.
                </p>

                <div className="space-y-4">
                  {[
                        { value: 'patrimoniale', label: 'Patrimoniale', rate: '6%', desc: 'Sécurité et stabilité à long terme' },
                        { value: 'mixte', label: 'Mixte', rate: '7%', desc: 'Équilibre entre sécurité et performance' },
                        { value: 'agressive', label: 'Agressive', rate: '8%', desc: 'Performance maximale avec plus de risque' }].
                        map((option) =>
                        <button
                          key={option.value}
                          onClick={() => setTypeStrategie(option.value)}
                          className={`w-full p-5 rounded-md border-2 text-left transition-all ${
                          typeStrategie === option.value ?
                          'bg-[#35a79b]/10 border-[#35a79b]' :
                          'bg-[#0a0c0c]/30 border-[#282b2a] hover:border-[#303332]'}`
                          }>

                      <div className="flex items-center justify-between">
                        <div className="flex items-start gap-4">
                          <div className={`mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                              typeStrategie === option.value ? 'border-[#35a79b]' : 'border-[#303332]'}`
                              }>
                            {typeStrategie === option.value && <div className="w-3 h-3 rounded-full bg-[#35a79b]" />}
                          </div>
                          <div>
                            <div className={`font-medium mb-1 ${
                                typeStrategie === option.value ? 'text-[#edeae5]' : 'text-[#d3d8d6]'}`
                                }>
                              {option.label}
                            </div>
                            <div className="text-sm text-[#edeae5]/70 font-normal">{option.desc}</div>
                          </div>
                        </div>
                        <div className={`text-2xl font-bold font-normal ${
                            typeStrategie === option.value ? 'text-[#35a79b]' : 'text-[#6b7270]'}`
                            }>
                          {option.rate}
                        </div>
                      </div>
                    </button>
                        )}
                </div>
              </motion.div>
                    }

            {/* Étape 4: Configuration des projets */}
            {currentStep === 4 &&
                    <motion.div
                      key="step4"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3 }}
                      className="grid md:grid-cols-[1fr_280px] gap-6">

                <div>
                  <h3 className="text-2xl text-[#edeae5] font-medium mb-3">
                    Planifiez vos projets
                  </h3>
                  <p className="text-[#edeae5] text-sm mb-8 font-normal">
                    Combien de projets souhaitez-vous réaliser et à quel rythme ?
                  </p>

                  <div className="space-y-6">
                    <div>
                      <Label className="text-sm text-[#edeae5] mb-3 block font-normal">Nombre de projets</Label>
                      <div className="flex items-center gap-3">
                        <Button
                                variant="outline"
                                size="icon"
                                onClick={() => projets.length > 1 && supprimerProjet(projets.length - 1)}
                                disabled={projets.length <= 1}
                                className="h-10 w-10 bg-[#0a0c0c]/50 border-2 border-[#282b2a] text-[#edeae5] hover:bg-[#0a0c0c] disabled:opacity-30">

                          <span className="text-lg">-</span>
                        </Button>
                        <div className="flex-1 text-center border-2 rounded-lg py-2 px-3 bg-[#0a0c0c]/30 border-[#282b2a]">
                          <span className="text-xl font-bold text-[#edeae5] font-normal">{projets.length}</span>
                        </div>
                        <Button
                                variant="outline"
                                size="icon"
                                onClick={ajouterProjet}
                                className="h-10 w-10 bg-[#35a79b] hover:bg-[#238276] text-[#edeae5] border-0">

                          <span className="text-lg">+</span>
                        </Button>
                      </div>
                    </div>

                    <div>
                      <Label className="text-sm text-[#edeae5] mb-3 block font-normal">Fréquence d'acquisition</Label>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                              { value: '1', label: 'Chaque année' },
                              { value: '2', label: 'Tous les 2 ans' },
                              { value: '3', label: 'Tous les 3 ans' }].
                              map((option) =>
                              <button
                                key={option.value}
                                onClick={() => setFrequence(Number(option.value))}
                                className={`h-14 rounded-md border-2 font-medium text-sm transition-all ${
                                frequence === Number(option.value) ?
                                'bg-[#35a79b] border-[#35a79b] text-[#edeae5]' :
                                'bg-[#0a0c0c]/30 border-[#282b2a] text-[#9aa19e] hover:border-[#303332]'}`
                                }>

                            {option.label}
                          </button>
                              )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Liste des projets à droite */}
                <div className="h-fit">
                  <Label className="text-xs uppercase tracking-wider mb-4 block text-[#edeae5] font-normal">
                    Mes projets ({projets.length})
                  </Label>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                    <AnimatePresence mode="popLayout">
                      {projets.map((projet, index) =>
                            <motion.div
                              key={index}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 10 }}
                              className="p-3 rounded-md border border-[#282b2a] bg-[#0a0c0c]/30 flex items-center gap-2">

                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] text-[#35a79b] font-bold uppercase mb-1">
                              An {index * frequence + 1}
                            </div>
                            <Select
                                  value={projet.taille}
                                  onValueChange={(v) => modifierTailleProjet(index, v)}>

                              <SelectTrigger className="h-8 text-xs bg-[#0a0c0c]/50 text-[#edeae5] border-[#282b2a] font-normal">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="200">200K€</SelectItem>
                                <SelectItem value="300">300K€</SelectItem>
                                <SelectItem value="400">400K€</SelectItem>
                                <SelectItem value="500">500K€</SelectItem>
                                <SelectItem value="700">700K€</SelectItem>
                                <SelectItem value="1000">1M€</SelectItem>
                                <SelectItem value="1200">1.2M€</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => dupliquerProjet(index)}
                            className="h-7 w-7 text-[#35a79b] hover:bg-[#35a79b]/10 shrink-0"
                            title="Dupliquer ce projet">

                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                          {projets.length > 1 &&
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => supprimerProjet(index)}
                                className="h-7 w-7 text-red-400 hover:bg-red-500/10 shrink-0">

                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                              }
                        </motion.div>
                            )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
                    }
          </AnimatePresence>

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between mt-10 pt-6 border-t border-[#282b2a]">
            {currentStep > 1 ?
                    <Button
                      onClick={() => setCurrentStep(currentStep - 1)}
                      variant="outline"
                      className="h-12 px-6 bg-[#0a0c0c]/50 border-[#282b2a] text-[#edeae5] hover:bg-[#0a0c0c] font-normal">

                Précédent
              </Button> :
                    <div />}

            {currentStep < 4 ?
                    <Button
                      onClick={() => setCurrentStep(currentStep + 1)} className="bg-[#35a79b] text-[#0a0c0c] px-8 py-2 text-sm font-medium rounded-full inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 h-12 hover:bg-[#238276] shadow-lg">


                Continuer
              </Button> :

                    <Button
                      onClick={calculerStrategie}
                      className="h-12 px-8 bg-[#e0c9a0] hover:bg-[#e5a968] text-black font-medium rounded-full shadow-lg hover:scale-105 transition-all">

                Voir ma stratégie
              </Button>
                    }
            </div>
            </div>
            </div>
            </div>
            </motion.div>
          }
            </AnimatePresence>
            </div>
            </div>);

}